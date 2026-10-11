import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Journal } from '../../client/journal';
function Preview(){const[open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Otevřít deník</button><Journal open={open} onClose={()=>setOpen(false)} onPlace={id=>{document.querySelector('#preview-status')!.textContent='Vybrané místo: '+id;}}/></>;}
createRoot(document.querySelector('#root')!).render(<Preview/>);
