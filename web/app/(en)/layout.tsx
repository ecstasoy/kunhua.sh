import { RootHtml } from '@/components/RootHtml';
import '../globals.css';

export { metadata } from '@/components/RootHtml';

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return <RootHtml locale="en">{children}</RootHtml>;
}
