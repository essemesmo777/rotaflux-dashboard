(function () {
  async function logout(options) {
    const settings = options || {};
    if (settings.demoMode) {
      window.top.location.href = "/login";
      return true;
    }
    if (!window.confirm("Deseja realmente sair da sua conta?")) return false;
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
      window.top.location.replace("/login");
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível encerrar a sessão.");
      return false;
    }
  }

  window.RotaFluxNavigation = Object.freeze({ logout });
})();
