export default function OperationsFrame({ source }: { source: string }) {
  return <main className="site-shell"><iframe className="dashboard-frame" src={source} title="Operações RotaFlux" /></main>;
}
