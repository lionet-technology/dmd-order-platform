import {db} from './db';
import {canonicalEnumValue} from './enums';
import {compareVnd, sumVnd, vnd} from './vnd-money';

import {componentGroups, type ComponentMapping} from './vnd-supplier-components';

type Input = Record<string, unknown>;
type Bucket = {mode: 'TOTAL' | 'SUM'; columns: string[]};
type Mapping = {
  tracking: string;
  line: string;
  weight: string;
  currency?: string;
  label_url?: string;
  components?: ComponentMapping[];
  actual: Bucket | null;
  surcharge: Bucket | null;
  surcharge_in_actual: boolean;
};

export function installSupplierTemplateSchema(database: typeof db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS vnd_supplier_templates (
      id INTEGER PRIMARY KEY, supplier TEXT NOT NULL, service TEXT NOT NULL, sub_service TEXT NOT NULL,
      version INTEGER NOT NULL, mapping_json TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(supplier,service,sub_service,version)
    );
    CREATE TABLE IF NOT EXISTS vnd_supplier_document_lines (
      row_id INTEGER PRIMARY KEY REFERENCES vnd_supplier_import_rows(id),
      supplier TEXT NOT NULL, document TEXT NOT NULL, line TEXT NOT NULL,
      template_id INTEGER NOT NULL REFERENCES vnd_supplier_templates(id), fingerprint TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vnd_supplier_document_identity
      ON vnd_supplier_document_lines(supplier,document,line,row_id DESC);
  `);
  for (const table of ['vnd_supplier_templates', 'vnd_supplier_document_lines']) {
    for (const operation of ['UPDATE', 'DELETE']) {
      database.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation}
        BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable supplier template evidence'); END;`);
    }
  }
}

function label(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200)
    throw Error('Cần tên cột hoặc mã chứng từ/dòng dạng text, tối đa 200 ký tự.');
  return value.trim();
}

function bucket(value: unknown): Bucket | null {
  if (value === null) return null;
  const input = value as Input | undefined;
  if (!input || (input.mode !== 'TOTAL' && input.mode !== 'SUM') || !Array.isArray(input.columns)
      || input.columns.length > 30 || (input.mode === 'TOTAL' ? input.columns.length !== 1 : input.columns.length < 2))
    throw Error('Mỗi nhóm dùng một cột tổng hoặc cộng ít nhất hai cột thành phần.');
  return {mode: input.mode, columns: input.columns.map(label)};
}

export function supplierTemplates(supplier: string) {
  return (db.prepare('SELECT * FROM vnd_supplier_templates WHERE supplier=? ORDER BY id DESC').all(supplier) as
    {id: number; service: string; sub_service: string; version: number; mapping_json: string}[])
    .map(row => ({...row, mapping: JSON.parse(row.mapping_json) as Mapping}));
}

export function saveSupplierTemplate(supplier: string, actorId: number, input: Input) {
  const service = canonicalEnumValue('SERVICE', label(input.service));
  const subService = canonicalEnumValue('SUB_SERVICE', label(input.sub_service), service);
  const config = input.mapping as Input | undefined;
  if (!config) throw Error('Cần cấu hình template Supplier.');
  const components = Array.isArray(config.components) ? config.components.map((raw: Input) => {
    const id = label(raw.id), column = label(raw.column);
    const group = componentGroups.find(candidate => candidate === raw.group);
    if (!group || !/^[A-Z][A-Z0-9_]{0,63}$/.test(id)) throw Error('Component ID hoặc nhóm không hợp lệ.');
    return {id, column, group};
  }) : undefined;
  if (components && (!components.length || components.length > 60 || new Set(components.map(c => c.id)).size !== components.length || (components.length === 1 && (components[0].id !== 'COST' || components[0].group !== 'Cost')))) throw Error('Cần Component ID duy nhất. Tuyến một thành phần dùng COST trong nhóm Cost.');
  if (!components && typeof config.surcharge_in_actual !== 'boolean') throw Error('Cần xác định phụ phí đã nằm trong Actual Net chưa.');
  const mapping: Mapping = {
    tracking: label(config.tracking), line: label(config.line), weight: config.weight ? label(config.weight) : '',
    currency: config.currency ? label(config.currency) : '',
    label_url: config.label_url ? label(config.label_url) : '',
    components, actual: components ? null : bucket(config.actual), surcharge: components ? null : bucket(config.surcharge), surcharge_in_actual: !components && config.surcharge_in_actual === true,
  };
  if (!components && ((!mapping.actual && !mapping.surcharge) || (mapping.surcharge_in_actual && (!mapping.actual || !mapping.surcharge))))
    throw Error('Cần nhóm Actual/Phụ phí hợp lệ.');
  const headings = [mapping.tracking, mapping.line, mapping.weight, mapping.currency, mapping.label_url, ...(mapping.actual?.columns ?? []), ...(mapping.surcharge?.columns ?? []), ...(mapping.components?.map(c => c.column) ?? [])].filter((column): column is string => Boolean(column));
  if (new Set(headings).size !== headings.length) throw Error('Một cột chỉ được map một lần.');
  const current = supplierTemplates(supplier).find(t => t.service === service && t.sub_service === subService);
  if (input.expected_version !== (current?.version ?? 0)) throw Error('Template đã thay đổi; tải lại trước khi lưu.');
  db.prepare('INSERT INTO vnd_supplier_templates(supplier,service,sub_service,version,mapping_json,actor_id) VALUES (?,?,?,?,?,?)')
    .run(supplier, service, subService, (current?.version ?? 0) + 1, JSON.stringify(mapping), actorId);
}

function decimal(value: unknown, optional: boolean) {
  if (optional && (value == null || value === '')) return '0';
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && Math.abs(value) >= 1e15))
    throw Error('Cần số thập phân VNĐ/kg; nhập số lớn dưới dạng text.');
  const result = vnd(String(value).trim());
  if (compareVnd(result, '0') < 0) throw Error('VNĐ/kg không được âm.');
  return result;
}

export function mappedSupplierRows(supplier: string, input: Input) {
  const template = supplierTemplates(supplier).find(t => t.id === Number(input.template_id));
  if (!template) throw Error('Template không thuộc Supplier.');
  const document = label(input.document);
  const grid = input.grid;
  if (!Array.isArray(grid) || grid.length < 2 || grid.length > 201 || grid.some(row => !Array.isArray(row) || row.length > 200))
    throw Error('Excel cần header và 1–200 dòng, tối đa 200 cột.');
  const [header, ...rows] = grid as unknown[][];
  const headings = header.map(cell => String(cell ?? '').trim());
  const mapping = template.mapping;
  const index = new Map<string, number>();
  for (const column of [mapping.tracking, mapping.line, mapping.weight, mapping.currency, mapping.label_url, ...(mapping.actual?.columns ?? []), ...(mapping.surcharge?.columns ?? []), ...(mapping.components?.map(c => c.column) ?? [])].filter((column): column is string => Boolean(column))) {
    const position = headings.indexOf(column);
    if (position < 0 || position !== headings.lastIndexOf(column)) throw Error('Cột bị thiếu hoặc xuất hiện nhiều lần: ' + column);
    index.set(column, position);
  }
  const result = rows.flatMap((cells, offset) => {
    if (!cells.some(cell => cell != null && String(cell).trim() !== '')) return [];
    const cell = (column: string) => cells[index.get(column)!];
    const parseErrors: string[] = [];
    const parse = <T>(column: string, read: () => T) => {
      try { return read(); }
      catch (error) {
        parseErrors.push(column + ': ' + (error instanceof Error ? error.message : String(error)));
        return null;
      }
    };
    const readBucket = (config: Bucket | null) => {
      if (!config) return null;
      const components = config.columns.map(column => ({
        column, amount: parse(column, () => decimal(cell(column), config.mode === 'SUM')),
      }));
      const total = components.every(c => c.amount !== null) ? sumVnd(components.map(c => c.amount!)) : null;
      return {mode: config.mode, components, total};
    };
    const actual = readBucket(mapping.actual), surcharge = readBucket(mapping.surcharge);
    const components = mapping.components?.map(component => {
      const value = cell(component.column);
      const amount = value == null || (typeof value === 'string' && !value.trim())
        ? null : parse(component.column, () => decimal(value, false));
      return {...component, amount};
    });
    if (components?.every(component => component.amount === null)) parseErrors.push('Cần ít nhất một số tiền.');
    const requiredBucket = mapping.actual ?? mapping.surcharge;
    if (requiredBucket?.mode === 'SUM' && requiredBucket.columns.every(column => cell(column) == null || cell(column) === ''))
      parseErrors.push('Nhóm chi phí chính trống; nhập 0 nếu số tiền bằng 0.');
    const tracking = parse(mapping.tracking, () => label(cell(mapping.tracking)));
    const labelColumn = mapping.label_url;
    const labelUrl = labelColumn && cell(labelColumn) != null && cell(labelColumn) !== ''
      ? parse(labelColumn, () => {
        const value = cell(labelColumn);
        if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw Error('Label cần là URL dạng text.');
        return value.trim();
      }) : null;
    const line = parse(mapping.line, () => label(cell(mapping.line)));
    const supplierWeight = mapping.weight && cell(mapping.weight) != null && cell(mapping.weight) !== ''
      ? parse(mapping.weight, () => decimal(cell(mapping.weight), false)) : null;
    if (mapping.surcharge_in_actual && actual?.total != null && surcharge?.total != null && compareVnd(surcharge.total, actual.total) > 0)
      parseErrors.push('Phụ phí đã gồm trong Actual nhưng lớn hơn Actual.');
    const currencyColumn = mapping.currency;
    if (currencyColumn) parse(currencyColumn, () => {
      const currency = label(cell(currencyColumn)).toUpperCase();
      if (!['VND', 'VNĐ'].includes(currency)) throw Error('Chỉ hỗ trợ chứng từ VNĐ.');
      return currency;
    });
    const amount = parseErrors.length ? null
      : components ? sumVnd(components.map(component => component.amount ?? '0'))
      : sumVnd([actual?.total ?? '0', mapping.surcharge_in_actual ? '0' : surcharge?.total ?? '0']);
    return [{
      components, kind: components || actual ? 'TOTAL' : 'SUPPLEMENT', tracking, label_url:labelUrl, amount, supplier_weight: supplierWeight,
      reference: document + ' / ' + (line ?? 'Excel ' + (offset + 2)),
      source: {
        document, line, excel_row: offset + 2, file_name: typeof input.file_name === 'string' ? input.file_name.slice(0, 255) : null, template_id: template.id, version: template.version,
        service: template.service, sub_service: template.sub_service, currency: 'VND',
        headers: header, cells, actual, surcharge, surcharge_in_actual: mapping.surcharge_in_actual,
      },
      parse_errors: parseErrors,
    }];
  });
  if (!result.length) throw Error('Excel không có dòng dữ liệu.');
  return result;
}
