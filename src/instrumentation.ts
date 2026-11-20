export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.DMD_ISOLATED_BUILD!=='1'){
  const {startVndWeeklyClose}=await import('./lib/vnd-weekly-scheduler');
  startVndWeeklyClose();
 }
}
