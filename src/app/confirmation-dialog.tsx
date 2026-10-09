"use client";
import {useEffect,useRef,type ReactNode} from 'react';

export function ConfirmationDialog({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();return ()=>{dialog?.close()}},[]);
 return <dialog ref={ref} className="routeConfirmationDialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
   <h3>{title}</h3>{children}
 </dialog>;
}
