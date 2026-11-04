'use client';
import {createContext,useContext,useEffect,useState} from 'react';
const Ctx=createContext(null);
export function LanguageProvider({children}){const [lang,setLang]=useState('de');useEffect(()=>{try{const saved=localStorage.getItem('martenwatch.language');if(saved==='en'||saved==='de')setLang(saved)}catch{}},[]);useEffect(()=>{document.documentElement.lang=lang},[lang]);function change(value){setLang(value);try{localStorage.setItem('martenwatch.language',value)}catch{}}return <Ctx.Provider value={{lang,change}}>{children}</Ctx.Provider>}
export function useLanguage(){return useContext(Ctx)}
export function pick(lang,de,en){return lang==='de'?de:en}
