// src/components/Icons.tsx — small inline SVG icon set (stroke, currentColor). No icon library (architecture §4).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});

export const IconArrowRight = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconArrowLeft = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
export const IconMic = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const IconStop = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
export const IconPlay = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M7 5l12 7-12 7z" /></svg>;
export const IconPause = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M8 5v14M16 5v14" /></svg>;
export const IconClose = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconCamera = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
export const IconPin = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
export const IconPhone = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
export const IconCheck = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconCopy = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
export const IconRefresh = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>;
export const IconMap = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></svg>;
export const IconList = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>;
export const IconSend = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 12 20 4l-6 16-3-7z" /></svg>;
export const IconAlert = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></svg>;
export const IconWifiOff = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.4-2.6M19 12.9a10 10 0 0 0-2.5-1.8M2 8.8A15 15 0 0 1 7 6M22 8.8A15 15 0 0 0 11 5.1M12 20h.01" /></svg>;
export const IconMenu = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const IconUser = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const IconExternal = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>;
export const IconPlus = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const IconEdit = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>;
export const IconTrash = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
export const IconFlask = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19l-6-10V3" /><path d="M7 15h10" /></svg>;
