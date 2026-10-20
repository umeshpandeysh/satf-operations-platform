import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TRANSLATIONS, getTranslation, SupportedLanguage } from "../lib/translations";

describe("SATF Internationalization (i18n) — Dictionary & Fallback Coverage", () => {
  test("dictionary has comprehensive coverage with non-empty strings", () => {
    const keys = Object.keys(TRANSLATIONS);
    assert.ok(keys.length >= 250, `Expected at least 250 translation keys, got ${keys.length}`);

    for (const key of keys) {
      const entry = TRANSLATIONS[key];
      assert.ok(entry, `Entry for key "${key}" must exist`);
      assert.ok(typeof entry.en === "string" && entry.en.trim().length > 0, `English translation for "${key}" is missing or empty`);
      assert.ok(typeof entry.ja === "string" && entry.ja.trim().length > 0, `Japanese translation for "${key}" is missing or empty`);
    }
  });

  test("Japanese translations contain authentic Japanese script (hiragana, katakana, or kanji)", () => {
    // Regex matching Hiragana, Katakana, CJK Unified Ideographs (Kanji)
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;

    // A few keys might be punctuation or numbers, but 90%+ must have Japanese characters
    let japaneseCharCount = 0;
    const keys = Object.keys(TRANSLATIONS);

    for (const key of keys) {
      const jaText = TRANSLATIONS[key].ja;
      if (japaneseRegex.test(jaText)) {
        japaneseCharCount++;
      }
    }

    const ratio = japaneseCharCount / keys.length;
    assert.ok(ratio > 0.90, `Expected at least 90% of Japanese translations to contain Japanese characters, got ${(ratio * 100).toFixed(1)}%`);
  });

  test("getTranslation returns correct localized strings for both en and ja", () => {
    assert.strictEqual(getTranslation("nav.brand", "en"), "SATF Operations");
    assert.strictEqual(getTranslation("nav.brand", "ja"), "SATF オペレーション");
    assert.strictEqual(getTranslation("btn.save", "en"), "Save Changes");
    assert.strictEqual(getTranslation("btn.save", "ja"), "保存する");
    assert.strictEqual(getTranslation("login.modal_title", "ja"), "運行コーディネーター認証");
    assert.strictEqual(getTranslation("import.canonical_count", "ja"), "正規化ツアー件数");
  });

  test("getTranslation gracefully falls back to key when key is unknown", () => {
    const missingKey = "unknown.sample.key.xyz";
    assert.strictEqual(getTranslation(missingKey, "en"), missingKey);
    assert.strictEqual(getTranslation(missingKey, "ja"), missingKey);
  });

  test("essential operational route keys exist and are translated", () => {
    const requiredKeys = [
      "nav.dashboard",
      "nav.tours",
      "nav.calendar",
      "nav.assignments",
      "nav.issues",
      "nav.reports",
      "nav.import",
      "nav.settings",
      "login.modal_title",
      "login.passphrase_label",
      "reports.tab_summary",
      "reports.tab_manifest",
      "import.dry_run",
      "import.commit_import",
      "settings.storage_title",
      "issues.title",
      "issues.connection_required_title",
      //  additional keys:
      "import_mgr.title",
      "import_mgr.real_data_active",
      "import_mgr.all_seasons",
      "create.title",
      "create.booking_ref",
      "edit.title",
      "edit.guide_section",
      "detail.cancelled_banner",
      "detail.cancellation_reason",
      "issues.all_issues",
      "issues.modal_category",
      "assign.conflict_title",
      "cal.movement_arrival",
      "common.golden_triangle",
    ];

    for (const key of requiredKeys) {
      assert.ok(TRANSLATIONS[key], `Required operational key "${key}" missing from TRANSLATIONS`);
      assert.ok(TRANSLATIONS[key].en, `English missing for "${key}"`);
      assert.ok(TRANSLATIONS[key].ja, `Japanese missing for "${key}"`);
    }
  });
});
