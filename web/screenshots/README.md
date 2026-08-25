# Ekran görüntüleri

Bu klasöre gerçek görselleri bıraktığınızda `web/build.mjs` onları otomatik
olarak `dist/screenshots/`'a kopyalar — `index.html`'de zaten doğru
dosya adlarına referans veriyor, başka hiçbir şey değiştirmeniz gerekmiyor.
Bir dosya eksikse (bu klasör boşken olduğu gibi) ilgili alan CSS
gradyan yer tutucusunu göstermeye devam eder, sayfa bozulmaz (bkz.
`onerror="this.style.display='none'"` + `styles.css`'teki
`.phone-screen`/`.feature-thumb` arka planları).

| Dosya adı | Nerede kullanılıyor | Oran | Önerilen boyut |
|---|---|---|---|
| `hero.png` | Hero'daki telefon mockup'ı | 9:19.5 (dikey telefon ekranı) | ≥1170×2532 (retina) |
| `rota-kesfi.png` | "Rota Keşfi" kart küçük resmi | 4:3 | ≥1200×900 |
| `surus-kaydi.png` | "Sürüş Kaydı" kart küçük resmi | 4:3 | ≥1200×900 |
| `isaretli-noktalar.png` | "İşaretli Noktalar" kart küçük resmi | 4:3 | ≥1200×900 |
| `grup-suruslari.png` | "Grup Sürüşleri" kart küçük resmi | 4:3 | ≥1200×900 |
| `forum.png` | "Soru-Cevap Forumu" kart küçük resmi | 4:3 | ≥1200×900 |

Kart küçük resimleri (4:3) tam bir ekran görüntüsü olmak zorunda değil —
telefon ekranından kırpılmış, o özelliği en iyi anlatan bir kesit de
olabilir (örn. haritadaki rota çizgisi, sürüş özeti kartı).

Format: PNG veya JPG, ikisi de çalışır (`object-fit: cover` ile
kırpılıp/ölçeklenip yerleştiriliyor, oranı tam tutturmanıza gerek yok).
