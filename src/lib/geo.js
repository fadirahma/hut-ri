/**
 * Definisi region (kelompok provinsi) dan proyeksi geografis
 * dari koordinat lng/lat ke ruang dunia 3D.
 */

export const REGION_DEFS = [
  {
    id: "sumatera",
    label: "Sumatera",
    name: "Pulau Sumatera",
    desc: "Pulau terbesar keenam di dunia — rumah Danau Toba dan jejak kejayaan Sriwijaya.",
    provinces: ["Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Jambi", "Bengkulu", "Sumatera Selatan", "Lampung", "Kepulauan Riau", "Bangka-Belitung"],
    factor: 0.9,
  },
  {
    id: "jawa",
    label: "Jawa",
    name: "Pulau Jawa",
    desc: "Pulau terpadat di Indonesia — rumah bagi lebih dari separuh penduduk bangsa.",
    provinces: ["Jakarta Raya", "Banten", "Jawa Barat", "Jawa Tengah", "Yogyakarta", "Jawa Timur"],
    factor: 0.85,
  },
  {
    id: "kalimantan",
    label: "Kalimantan",
    name: "Kalimantan",
    desc: "Pulau terbesar ketiga di dunia — paru-paru dunia dengan hutan hujan tropisnya.",
    provinces: ["Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara"],
    factor: 0.75,
  },
  {
    id: "sulawesi",
    label: "Sulawesi",
    name: "Sulawesi",
    desc: "Pulau berbentuk unik menyerupai huruf K, dikelilingi laut dalam.",
    provinces: ["Sulawesi Utara", "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tenggara"],
    factor: 0.8,
  },
  {
    id: "bali",
    label: "Bali & Nusa Tenggara",
    name: "Bali & Nusa Tenggara",
    desc: "Gugusan surga tropis — dari Bali hingga Pulau Komodo.",
    provinces: ["Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur"],
    factor: 0.65,
  },
  {
    id: "maluku",
    label: "Maluku",
    name: "Kepulauan Maluku",
    desc: "Kepulauan rempah bersejarah — dari Ternate hingga Kepulauan Banda.",
    provinces: ["Maluku", "Maluku Utara"],
    factor: 0.7,
  },
  {
    id: "papua",
    label: "Papua",
    name: "Papua",
    desc: "Pulau terbesar kedua di dunia dengan puncak bersalju Cartenz di khatulistiwa.",
    provinces: ["Papua Barat", "Papua"],
    factor: 1.0,
  },
];

export const OVERVIEW = {
  name: "NUSANTARA",
  desc: "Dari Sabang sampai Merauke — ribuan pulau dalam satu kesatuan.",
};

/**
 * Proyeksi lng/lat -> dunia 3D (x ke timur, z ke utara).
 * Lebar kepulauan dinormalisasi ke `WIDTH` satuan dunia.
 */
export function createProjection(features, WIDTH = 34) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of features) {
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }
  const cx = (minLng + maxLng) / 2;
  const cy = (minLat + maxLat) / 2;
  const cosFix = Math.cos((cy * Math.PI) / 180);
  const S = WIDTH / ((maxLng - minLng) * cosFix);

  const proj = (lng, lat) => [(lng - cx) * cosFix * S, (lat - cy) * S];

  return { proj, cx, cy, S, bbox: { minLng, maxLng, minLat, maxLat } };
}
