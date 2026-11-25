'use client';
import {useEffect,useState} from 'react';
// Keep an editable draft: deleting all digits must not immediately insert a zero.
export function IntegerInput({value,onChange,min=0,max,required=true}:{value:number;onChange:(value:number)=>void;min?:number;max?:number;required?:boolean}){
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>setDraft(String(value)),[value]);
 return <input type="text" inputMode="numeric" pattern="[0-9]+" required={required} value={draft} onFocus={e=>e.currentTarget.select()} onClick={e=>e.currentTarget.select()} onChange={e=>{const text=e.target.value.replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10));if(!/^\d*$/.test(text))return;setDraft(text);const n=Number(text);e.target.setCustomValidity(text&&(!Number.isSafeInteger(n)||n<min||(max!==undefined&&n>max))?`${min}以上${max!==undefined?max+'以下':''}の整数を入力してください`:'');if(text&&Number.isSafeInteger(n))onChange(n);}} onBlur={()=>{if(draft)setDraft(String(Number(draft)));}}/>;
}
