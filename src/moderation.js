export function detectBlockedRequest(prompt) {
  const text = normalizeModerationText(prompt);
  if (!text) return "";

  const blockedCategories = [
    {
      category: "sexual_content",
      patterns: [
        /\b(?:bikini|lingerie|underwear|bra|panties|topless|telanjang|bugil|nude|naked|sensual|erotis|erotic|seksi|seductive|nsfw|hentai|nudify)\b/,
        /\b(?:pakaian dalam|celana dalam|tanpa pakaian|tanpa baju|tanpa busana|see through|tembus pandang|pakaian transparan|baju transparan|pakaian basah|baju basah|pose menggoda)\b/,
        /\b(?:transparan|deep nude)\b/,
        /\bdeepfake\b.{0,30}\b(?:nude|naked|telanjang|bugil)\b/,
        /\b(?:tidak memakai|tidak menggunakan|tidak mengenakan)\s+(?:busana|pakaian|baju)\b/,
        /\b(?:remove|take off|strip|erase|delete|hapus|hilangkan|lepas|buka)\b.{0,40}\b(?:clothes|clothing|dress|shirt|skirt|pants|bra|underwear|panties|pakaian|baju|gaun|rok|celana|pakaian dalam)\b/,
        /\b(?:reveal|show|expose|perlihatkan|tampilkan|kelihatan|terlihat)\b.{0,40}\b(?:breast|breasts|nipple|nipples|genital|genitals|penis|vagina|buttocks|payudara|puting|alat kelamin|kemaluan|bokong)\b/,
      ],
    },
    {
      category: "minor_content",
      patterns: [
        /\b(?:anak|anak anak|remaja|bocah|smp|sma|seragam sekolah|loli|child|children|teen|teenager)\b/,
      ],
    },
    {
      category: "graphic_violence",
      patterns: [
        /\b(?:darah|berdarah|mayat|gore|luka parah|mutilasi|tembak|senjata|pistol)\b/,
      ],
    },
    {
      category: "hate_or_terrorism",
      patterns: [
        /\b(?:simbol kebencian|nazi|isis|ekstremis|teroris)\b/,
      ],
    },
    {
      category: "drugs",
      patterns: [
        /\b(?:narkoba|sabu|ganja|kokain)\b/,
      ],
    },
    {
      category: "identity_or_financial_document",
      patterns: [
        /\b(?:ktp|paspor|sim|kartu kredit|tanda tangan|stempel|sertifikat|palsu)\b/,
      ],
    },
    {
      category: "self_harm_or_eating_disorder",
      patterns: [
        /\b(?:bunuh diri|gantung diri|sayat|self harm|anoreksia)\b/,
      ],
    },
    {
      category: "torture_or_execution",
      patterns: [
        /\b(?:siksa|penyiksaan|sembelih|eksekusi|hewan disiksa)\b/,
      ],
    },
    {
      category: "gambling_or_alcohol",
      patterns: [
        /\b(?:judi|slot|kasino|togel|miras)\b/,
      ],
    },
    {
      category: "religious_or_political_sensitive",
      patterns: [
        /\b(?:nabi|kitab suci|bendera terlarang|kampanye|capres|presiden)\b/,
      ],
    },
    {
      category: "medical_sensitive",
      patterns: [
        /\b(?:operasi|organ dalam|penyakit|bayi cacat)\b/,
      ],
    },
    {
      category: "identity_manipulation",
      patterns: [
        /\bdeepfake\b/,
      ],
    },
  ];

  for (const group of blockedCategories) {
    if (group.patterns.some((pattern) => pattern.test(text))) {
      return group.category;
    }
  }

  return "";
}

function normalizeModerationText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/\b(baju|pakaian|gaun|rok|celana)(?:nya)\b/g, "$1")
    .replace(/\b(lepaskan|menanggalkan|membuka)\b/g, "lepas")
    .replace(/[_.,/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

