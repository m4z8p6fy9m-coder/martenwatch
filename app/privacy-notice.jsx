'use client';
import {useState} from 'react';

export default function PrivacyNotice(){
 const [ageRange,setAgeRange]=useState('');
 return <section className="privacy-notice" aria-label="Datenschutz und Altersangabe">
  <div><b>Datenschutz in dieser Demo</b><p>Nur erfundene Daten eingeben. Kein Werbe- oder Analysetracking ist eingerichtet; technische Messwerte bleiben lokal im API-Prozess. <a href="/privacy">Datenschutzhinweise lesen</a></p></div>
  <label>Altersgruppe (freiwillig, nur in dieser Ansicht)
   <select value={ageRange} onChange={e=>setAgeRange(e.target.value)}>
    <option value="">Keine Angabe</option><option value="under16">Unter 16</option><option value="16plus">16 oder älter</option>
   </select>
  </label>
  {ageRange && <p>Die Angabe wird nicht gespeichert oder geprüft. Sie ist keine Altersverifikation und keine Einwilligung der Erziehungsberechtigten.</p>}
 </section>;
}
