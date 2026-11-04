import './style.css';
import {LanguageProvider} from './language';
export const metadata = { title: 'Martenwatch', description: 'Simulated agent action approvals and recovery' };
export default function Layout({children}) { return <html lang="de"><body><LanguageProvider>{children}</LanguageProvider></body></html>; }
