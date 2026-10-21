'use client';
import {useState} from 'react';
import GenderPreferenceControl from './gender-preference';
import MySizes from './my-sizes';
import type {Preferences,GenderPreference,Sizing} from '@/lib/preferences';
export default function GlobalFilters({settings,labels,apply,cancel}:{settings:Preferences;labels:string[];apply:(value:{gender:GenderPreference;sizing:Sizing})=>void;cancel:()=>void}){
 const [gender,setGender]=useState(settings.gender);
 return <div className="global-filter-form"><MySizes value={settings.sizing} labels={labels} allowAllSizes cancel={cancel} before={<><p className="filter-intro">Personalize all your feeds in one place.</p><GenderPreferenceControl value={gender} change={setGender}/></>} submitLabel="Apply filters" save={sizing=>apply({gender,sizing})}/></div>;
}
