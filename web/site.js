// Kavis — kavisapp.com paylaşılan istemci script'i.
// Şu an tek işi: ".reveal" sınıflı elemanları, ekrana girdikçe yumuşakça
// belirt (IntersectionObserver). Hem ana sayfada hem /rotalar ve
// /rotalar/{slug} sayfalarında aynı dosya kullanılıyor — bu yüzden her
// üretilen HTML sayfasında tek tek tekrarlanmıyor.
//
// prefers-reduced-motion'a saygı: styles.css'teki global kural zaten
// tüm transition/animation sürelerini bu tercihte ~0'a indiriyor (bkz.
// styles.css "@media (prefers-reduced-motion: reduce)"), yani observer
// çalışsa bile görünürde bir "kayma" olmaz. Ama burada AYRICA baştan
// atlıyoruz — hem gereksiz bir gözlemciyi kurmamış oluyoruz hem de ilk
// boyamada elemanların bir an görünmez kalıp aniden belirmesi ihtimalini
// (ilk render'da observer henüz tetiklenmeden geçen kısa an) ortadan
// kaldırıyoruz.
(function () {
  var items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    items.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  items.forEach(function (el) {
    observer.observe(el);
  });
})();

// /rotalar liste sayfasındaki bölge filtresi — sadece o sayfada
// ".route-filter" varsa çalışır, diğer sayfalarda no-op.
(function () {
  var filterBar = document.querySelector(".route-filter");
  if (!filterBar) return;

  var buttons = filterBar.querySelectorAll("[data-region-filter]");
  var cards = document.querySelectorAll("[data-regions]");

  filterBar.addEventListener("click", function (event) {
    var button = event.target.closest("[data-region-filter]");
    if (!button) return;

    buttons.forEach(function (b) {
      b.classList.toggle("is-active", b === button);
      b.setAttribute("aria-pressed", b === button ? "true" : "false");
    });

    var region = button.getAttribute("data-region-filter");
    cards.forEach(function (card) {
      var regions = (card.getAttribute("data-regions") || "").split("|");
      var show = region === "tumu" || regions.indexOf(region) !== -1;
      card.style.display = show ? "" : "none";
    });
  });
})();
