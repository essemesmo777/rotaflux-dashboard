import LazyFrame from "../../components/lazy-frame";

export default function DemoPage() {
  return (
    <main className="demo-shell">
      <div className="demo-bar" role="status">
        <span className="demo-badge">Modo demo</span>
        <span>Você está explorando dados fictícios em um ambiente somente para visualização.</span>
        <a href="/login">Entrar na minha conta</a>
      </div>
      <LazyFrame source="/dashboard.html?demo=1" title="Demonstração do painel OperBase" />
    </main>
  );
}
