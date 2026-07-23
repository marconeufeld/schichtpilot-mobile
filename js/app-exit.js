(() => {
  function finishApp() {
    // Browser und iOS erlauben einer installierten Web-App nicht zuverlässig,
    // sich selbst zu schließen. Wir versuchen es und zeigen andernfalls einen
    // klaren Abschlussbildschirm.
    try {
      window.close();
    } catch {
      // Der Abschlussbildschirm ist der sichere Rückfall.
    }

    window.setTimeout(() => {
      window.location.replace("beenden.html?v=033");
    }, 80);
  }

  document.querySelectorAll(".app-exit-button").forEach(button => {
    button.addEventListener("click", finishApp);
  });
})();
