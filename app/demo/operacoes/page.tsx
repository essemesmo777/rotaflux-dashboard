export default function DemoOperationsPage() {
  return (
    <main className="demo-shell">
      <div className="demo-bar" role="status">
        <span className="demo-badge">Modo demo</span>
        <span>Você está explorando dados fictícios em um ambiente somente para visualização.</span>
        <a href="/login">Entrar na minha conta</a>
      </div>
      <iframe className="dashboard-frame" src="/operations.html?demo=1" title="Demonstração das operações RotaFlux" />
    </main>
  );
}
