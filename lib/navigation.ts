import {Home,Compass,Users,Search,Heart,Tags,SlidersHorizontal,Settings,type LucideIcon} from 'lucide-react';
export type NavigationItem=[string,string,LucideIcon];
export const shoppingNavigation:NavigationItem[]=[['/','Home',Home],['/discover','Discover',Compass],['/following','Following',Users],['/searches','Saved Searches',Search],['/saved','Saved Items',Heart]];
export const preferenceNavigation:NavigationItem[]=[['/brands','Brands',Tags],['/styles','My Styles',SlidersHorizontal],['/settings','Settings',Settings]];
export const navigation=[...shoppingNavigation,...preferenceNavigation];
export const mobileNavigation=[shoppingNavigation[0],shoppingNavigation[1],shoppingNavigation[2],shoppingNavigation[4]];
export const moreNavigation=[shoppingNavigation[3],...preferenceNavigation];
