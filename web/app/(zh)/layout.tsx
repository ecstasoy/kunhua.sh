import { RootHtml } from '@/components/RootHtml';
import '../globals.css';

export { metadata } from '@/components/RootHtml';

export default function ZhLayout({ children }: { children: React.ReactNode }) {
  return <RootHtml locale="zh">{children}</RootHtml>;
}
