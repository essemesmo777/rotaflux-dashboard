import LazyFrame from "../../components/lazy-frame";

export default function OperationsFrame({ source }: { source: string }) {
  return <main className="site-shell"><LazyFrame source={source} title="Operações OperBase" /></main>;
}
