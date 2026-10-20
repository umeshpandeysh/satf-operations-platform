/**
 * SATF Operations Platform — Comprehensive Internationalization Dictionary
 * Supports 100% UI coverage across English (en) and Japanese (ja).
 */

export type SupportedLanguage = "en" | "ja";

export interface TranslationDictionary {
  [key: string]: {
    en: string;
    ja: string;
  };
}

export const TRANSLATIONS: TranslationDictionary = {
  // Navigation & Branding
  "nav.brand": {
    en: "SATF Operations",
    ja: "SATF オペレーション",
  },
  "nav.brand_sub": {
    en: "South Asia Travel Factory",
    ja: "サウスアジア・トラベルファクトリー",
  },
  "nav.dashboard": {
    en: "Operations Command",
    ja: "オペレーション司令塔",
  },
  "nav.tours": {
    en: "Tours Roster",
    ja: "ツアー台帳",
  },
  "nav.calendar": {
    en: "Dispatch Calendar",
    ja: "運行カレンダー",
  },
  "nav.assignments": {
    en: "Fleet & Guides",
    ja: "ガイド・配車管理",
  },
  "nav.issues": {
    en: "Client Issues",
    ja: "顧客・案件対応",
  },
  "nav.reports": {
    en: "Analytics",
    ja: "分析レポート",
  },
  "nav.settings_import": {
    en: "Settings & Import Review",
    ja: "設定・インポート審査",
  },
  "nav.analytics_settings": {
    en: "Analytics & Settings",
    ja: "分析・設定",
  },
  "nav.import": {
    en: "Import Review",
    ja: "インポート審査",
  },
  "nav.settings": {
    en: "Settings",
    ja: "システム設定",
  },
  "nav.time_zone": {
    en: "India Ops Time (IST)",
    ja: "インド現地時間 (IST)",
  },
  "nav.operator_online": {
    en: "Operations Online",
    ja: "運行管制稼働中",
  },
  "nav.sign_in": {
    en: "Sign In",
    ja: "ログイン",
  },
  "nav.sign_out": {
    en: "Sign Out",
    ja: "ログアウト",
  },
  "nav.authenticated": {
    en: "Coordinator Active",
    ja: "コーディネーター認証済",
  },
  "nav.menu": {
    en: "Menu",
    ja: "メニュー",
  },
  "nav.close_menu": {
    en: "Close Menu",
    ja: "メニューを閉じる",
  },
  "auth.modal_title": {
    en: "Coordinator Authentication",
    ja: "運行管理スタッフ認証",
  },
  "auth.modal_desc": {
    en: "Enter your operator passphrase or coordinator credentials to access dispatch mutations and tour management.",
    ja: "運行管理およびツアー配車を操作するためのパスフレーズまたは認証情報を入力してください。",
  },
  "auth.passphrase_label": {
    en: "Operator Passphrase",
    ja: "オペレーター・パスフレーズ",
  },
  "auth.passphrase_placeholder": {
    en: "Enter secret passphrase...",
    ja: "パスフレーズを入力...",
  },
  "auth.username_label": {
    en: "Coordinator Username (Optional)",
    ja: "コーディネーター・ユーザー名 (任意)",
  },
  "auth.username_placeholder": {
    en: "Leave blank for general duty passphrase",
    ja: "共通パスフレーズの場合は空欄",
  },
  "auth.mfa_label": {
    en: "MFA Code (If enabled)",
    ja: "MFA認証コード (有効な場合)",
  },
  "auth.mfa_placeholder": {
    en: "6-digit TOTP code",
    ja: "6桁のワンタイムコード",
  },
  "auth.submit": {
    en: "Authenticate",
    ja: "認証する",
  },
  "auth.authenticating": {
    en: "Authenticating...",
    ja: "認証中...",
  },
  "auth.authenticated_as": {
    en: "Active Operator",
    ja: "担当コーディネーター",
  },
  "auth.cancel": {
    en: "Cancel",
    ja: "キャンセル",
  },

  // Homepage / Hero / Quotes
  "hero.badge": {
    en: "Luxury South Asian Tour Operations & Logistics",
    ja: "南アジア上質旅行の手配・運行管理",
  },
  "hero.title_line1": {
    en: "Operational Precision.",
    ja: "正確無比な運行管理。",
  },
  "hero.title_line2": {
    en: "Uncompromising Hospitality.",
    ja: "おもてなしの真髄を旅に。",
  },
  "hero.subtitle": {
    en: "Unified dispatch, real-time fleet coordination, and verified itinerary tracking across India, Nepal, Bhutan, and Sri Lanka.",
    ja: "インド、ネパール、ブータン、スリランカ全域における統一運行管理、配車・ガイド連携、行程追跡プラットフォーム。",
  },
  "hero.tours_stat": {
    en: "1,757 Operations Reconciled",
    ja: "手配完了実績 1,757件",
  },
  "hero.years_stat": {
    en: "10 Seasons of Excellence",
    ja: "10年間に及ぶ信頼と実績",
  },
  "hero.circuits_stat": {
    en: "Golden Triangle & Himalayan Circuits",
    ja: "ゴールデントライアングル・ヒマラヤ山系ルート",
  },
  "hero.open_tours": {
    en: "Explore Tours Roster",
    ja: "ツアー台帳を開く",
  },
  "hero.open_calendar": {
    en: "View Schedule Calendar",
    ja: "運行スケジュールを見る",
  },

  // Quotes Section
  "quote.tag": {
    en: "Hospitality & Service Philosophy",
    ja: "SATFのおもてなし哲学",
  },
  "quote.one": {
    en: "Great journeys are measured not just in miles covered, but in the seamless precision of every arrival and every welcome.",
    ja: "素晴らしい旅の価値は、巡った距離だけでなく、一つひとつの到着と温かな歓迎が完璧に整えられているかに宿る。",
  },
  "quote.two": {
    en: "True luxury in travel is invisible coordination: every driver in place, every guide prepared, and every guest cherished.",
    ja: "旅における真の贅沢とは、目に見えない完璧な連携である。定時に待つ車、熟練のガイド、そしてお客様への敬意。",
  },
  "quote.three": {
    en: "Behind every unforgettable sunset across the Subcontinent lies an unwavering team dedicated to safety, punctuality, and care.",
    ja: "南アジアの雄大な夕景の記憶の傍らには、安全・定時運行・真心ある手配に全力を注ぐ専門チームが存在する。",
  },
  "quote.author_anonymous": {
    en: "SATF Operations Philosophy",
    ja: "SATF オペレーション信条",
  },

  // About Section (Homepage Bottom)
  "about.title": {
    en: "About South Asia Travel Factory",
    ja: "サウスアジア・トラベルファクトリーについて",
  },
  "about.subtitle": {
    en: "Premier inbound destination management and bespoke travel infrastructure.",
    ja: "南アジア特化型インバウンド手配・高品質旅行インフラの専門会社。",
  },
  "about.p1": {
    en: "South Asia Travel Factory (SATF) provides comprehensive inbound ground operations, customized luxury circuit itineraries, and destination logistics for travelers across Japan, East Asia, and global markets.",
    ja: "サウスアジア・トラベルファクトリー（SATF）は、日本をはじめとする東アジアおよび世界中のお客様に向け、南アジア全域の地上手配、オーダーメイドの上質周遊ツアー、現地物流・配車をワンストップで提供しています。",
  },
  "about.p2": {
    en: "Our operations hub coordinates certified multi-lingual guides, vetted luxury vehicle fleets, hand-selected heritage hotel stays, and continuous 24/7 on-circuit traveler safety monitoring.",
    ja: "当社の運行管理センターは、公認外国語ガイドの配属、厳選された専属車両・ドライバー、厳選ヘリテージホテルの確保、そして24時間体制の安心安全モニタリングを統合管理しています。",
  },
  "about.feature1_title": {
    en: "Direct Local Network",
    ja: "現地直営ネットワーク",
  },
  "about.feature1_desc": {
    en: "Permanent operational branches across Delhi, Jaipur, Agra, Varanasi, Kochi, and Kathmandu.",
    ja: "デリー、ジャイプル、アーグラ、バラナシ、コーチ、カトマンズに展開する強固な現地拠点。",
  },
  "about.feature2_title": {
    en: "Japanese-Speaking Staff",
    ja: "熟練の日本語対応スタッフ",
  },
  "about.feature2_desc": {
    en: "Dedicated Japanese-speaking tour coordinators and government-licensed guides for cultural comfort.",
    ja: "日本の文化と細やかなニーズを深く理解する専属コーディネーターと公認ガイドが常駐。",
  },
  "about.feature3_title": {
    en: "24/7 Dispatch Control",
    ja: "24時間運行管理サポート",
  },
  "about.feature3_desc": {
    en: "Live GPS flight tracking, driver check-in verification, and proactive weather/itinerary management.",
    ja: "フライト遅延連動、ドライバー位置確認、天候や交通に即応するプロアクティブな手配力。",
  },

  // Dashboard Metrics & Views
  "dash.active_operations": {
    en: "Active Operations",
    ja: "運行中ツアー",
  },
  "dash.arriving_today": {
    en: "Arriving Today",
    ja: "本日到着",
  },
  "dash.departing_today": {
    en: "Departing Today",
    ja: "本日出発",
  },
  "dash.total_database": {
    en: "Authoritative Dataset",
    ja: "手配台帳総数",
  },
  "dash.attention_needed": {
    en: "Attention Needed",
    ja: "要確認事項",
  },
  "dash.attention_subtitle": {
    en: "Tours requiring driver/guide assignment, hotel confirmation, or flight update",
    ja: "ガイド・ドライバー未配属、ホテル予約番号未確認、またはフライト確認が必要なツアー",
  },
  "dash.upcoming_arrivals": {
    en: "Upcoming Arrivals Schedule",
    ja: "直近の到着予定スケジュール",
  },
  "dash.view_all_tours": {
    en: "View All 1,757 Tours →",
    ja: "全1,757件のツアーを見る →",
  },
  "dash.no_attention": {
    en: "All active tours are fully staffed and confirmed.",
    ja: "現在、確認が必要なツアーはありません。すべての手配が整っています。",
  },
  "dash.source_banner": {
    en: "Authoritative Operational Dataset Loaded (1,757 Tours)",
    ja: "公式オペレーション台帳を読込済 (1,757件)",
  },
  "dash.source_desc": {
    en: "Displaying live confirmed records from Supabase production datastore.",
    ja: "Supabaseデータベースに登録された最新の確定データを表示しています。",
  },

  // Tours Roster View
  "tours.title": {
    en: "Operational Tours Roster",
    ja: "ツアー運行・手配台帳",
  },
  "tours.search_placeholder": {
    en: "Search booking reference, guest name, destination, agency...",
    ja: "予約番号、お客様氏名、訪問都市、代理店名で検索...",
  },
  "tours.filter_all": {
    en: "All Statuses",
    ja: "すべての状態",
  },
  "tours.filter_active": {
    en: "Active",
    ja: "運行中",
  },
  "tours.filter_upcoming": {
    en: "Upcoming",
    ja: "予定",
  },
  "tours.filter_attention": {
    en: "Needs Attention",
    ja: "要確認",
  },
  "tours.filter_completed": {
    en: "Completed",
    ja: "完了",
  },
  "tours.filter_cancelled": {
    en: "Cancelled",
    ja: "キャンセル",
  },
  "tours.col_ref": {
    en: "Booking Ref",
    ja: "予約番号",
  },
  "tours.col_guest": {
    en: "Guest / Group",
    ja: "お客様 / 団体名",
  },
  "tours.col_pax": {
    en: "Pax",
    ja: "人数",
  },
  "tours.col_dates": {
    en: "Arrival — Departure",
    ja: "到着日 — 出発日",
  },
  "tours.col_dest": {
    en: "Circuit / Destination",
    ja: "周遊ルート / 行先",
  },
  "tours.col_guide": {
    en: "Tour Guide",
    ja: "担当ガイド",
  },
  "tours.col_driver": {
    en: "Driver & Vehicle",
    ja: "ドライバー / 車両",
  },
  "tours.col_status": {
    en: "Status",
    ja: "状態",
  },
  "tours.col_actions": {
    en: "Action",
    ja: "操作",
  },
  "tours.view_detail": {
    en: "View File",
    ja: "詳細を開く",
  },
  "tours.edit_record": {
    en: "Edit Assignment",
    ja: "手配・配属編集",
  },
  "tours.new_tour": {
    en: "New Tour",
    ja: "新規ツアー登録",
  },
  "tours.active_roster": {
    en: "Active Tour Operations Roster",
    ja: "運行ツアー台帳一覧",
  },
  "tours.reset_filters": {
    en: "Reset all filters",
    ja: "全フィルターをリセット",
  },
  "tours.ready": {
    en: "Ready",
    ja: "手配完了",
  },
  "tours.blocker": {
    en: "Blocker",
    ja: "要対応",
  },
  "tours.open": {
    en: "Open",
    ja: "開く",
  },
  "tours.no_records": {
    en: "No tours match the selected criteria.",
    ja: "指定した検索条件に該当するツアーはありません。",
  },

  // Assignments View
  "assign.title": {
    en: "Fleet, Driver & Guide Resource Matrix",
    ja: "配車・ドライバー・ガイド配属マトリクス",
  },
  "assign.subtitle": {
    en: "Manage and allocate certified guides, vetted chauffeurs, and tour vehicles across circuits.",
    ja: "各周遊ルートにおける公認ガイド、専属ドライバー、手配車両の配属および稼働状況の管理。",
  },
  "assign.role_all": {
    en: "All Resources",
    ja: "全リソース",
  },
  "assign.role_guide": {
    en: "Tour Guides",
    ja: "ガイド",
  },
  "assign.role_driver": {
    en: "Drivers",
    ja: "ドライバー",
  },
  "assign.role_vehicle": {
    en: "Vehicles",
    ja: "車両",
  },
  "assign.role_conflicts": {
    en: "Allocation Conflicts",
    ja: "重複・重複配属アラート",
  },
  "assign.status_assigned": {
    en: "Assigned",
    ja: "配属済",
  },
  "assign.status_pending": {
    en: "Pending Allocation",
    ja: "配属手配中",
  },
  "assign.status_unassigned": {
    en: "Unassigned",
    ja: "未配属",
  },
  "assign.conflict_banner_title": {
    en: "Operational Allocation Conflicts Detected",
    ja: "リソースの重複配属・競合が検出されました",
  },
  "assign.reassign_modal_title": {
    en: "Edit Resource Assignment",
    ja: "担当リソースの変更・配属",
  },
  "assign.guides_kpi": {
    en: "Tour Guides",
    ja: "ツアーガイド",
  },
  "assign.drivers_kpi": {
    en: "Chauffeurs & Drivers",
    ja: "専属ドライバー",
  },
  "assign.vehicles_kpi": {
    en: "Tour Fleet Vehicles",
    ja: "運行車両",
  },
  "assign.search_placeholder": {
    en: "Search reference, resource name, contact, notes...",
    ja: "予約番号、担当者名、連絡先、備考で検索...",
  },
  "reports.title": {
    en: "Operations Analytics & Manifests",
    ja: "運行分析・マニフェスト出力",
  },
  "reports.subtitle": {
    en: "Generate operational reports, airport arrival manifests, and resource allocation exports.",
    ja: "運行状況、空港送迎マニフェスト、リソース配属状況の各種データ出力。",
  },
  "settings.title": {
    en: "Platform Configuration & Data Management",
    ja: "システム設定・データ管理",
  },
  "settings.subtitle": {
    en: "Manage data reconciliation, session state, audit logs, and operational boundaries.",
    ja: "データ照合、セッション状態、監査ログ、運行管理設定。",
  },

  // Calendar View
  "cal.title": {
    en: "Operational Schedule Calendar",
    ja: "ツアー運行スケジュールカレンダー",
  },
  "cal.today": {
    en: "Today",
    ja: "今日",
  },
  "cal.all_events": {
    en: "All Events",
    ja: "全イベント",
  },
  "cal.arrivals": {
    en: "Arrivals",
    ja: "到着便・到着日",
  },
  "cal.departures": {
    en: "Departures",
    ja: "出発便・出発日",
  },
  "cal.hotel_checkins": {
    en: "Hotel Check-ins",
    ja: "ホテル着",
  },
  "cal.month": {
    en: "Month",
    ja: "月",
  },
  "cal.year": {
    en: "Year",
    ja: "年",
  },
  "cal.no_events": {
    en: "No scheduled arrivals or departures on this date.",
    ja: "この日の発着予定はありません。",
  },

  // Client Email Issues View
  "issues.title": {
    en: "Client Email Inquiries & Issue Tracking",
    ja: "顧客・代理店メール問い合わせ・案件管理",
  },
  "issues.subtitle": {
    en: "Unified communication inbox, flight delay alerts, special itinerary requests, and coordinator responses.",
    ja: "顧客・代理店からの受信メール、フライト遅延通報、特別な旅程リクエストの一元対応。",
  },
  "issues.status_open": {
    en: "Open",
    ja: "新規受付",
  },
  "issues.status_in_progress": {
    en: "In Progress",
    ja: "対応中",
  },
  "issues.status_waiting": {
    en: "Waiting on Client",
    ja: "お客様返信待ち",
  },
  "issues.status_resolved": {
    en: "Resolved",
    ja: "解決済",
  },
  "issues.priority_urgent": {
    en: "Urgent",
    ja: "至急",
  },
  "issues.priority_high": {
    en: "High",
    ja: "高",
  },
  "issues.priority_medium": {
    en: "Medium",
    ja: "中",
  },
  "issues.priority_low": {
    en: "Low",
    ja: "低",
  },
  "issues.connection_required_title": {
    en: "Email Provider Integration Required",
    ja: "メール連携設定が必要です",
  },
  "issues.connection_required_desc": {
    en: "Connect an authenticated Google Workspace, Microsoft 365, or IMAP/SMTP inbound mail gateway to ingest live client threads directly into this dashboard.",
    ja: "Google Workspace、Microsoft 365、またはIMAP/SMTP連携を設定すると、お客様からのメール問い合わせを本画面で直接受信・対応できます。",
  },
  "issues.configured_gateway": {
    en: "Gateway Status: Inbound Service Integration Boundary Ready",
    ja: "連携状態: 受信サービスインターフェース準備完了",
  },
  "issues.search_placeholder": {
    en: "Search email subject, sender address, tour booking ref...",
    ja: "件名、送信者メールアドレス、予約番号で検索...",
  },
  "issues.empty_inbox": {
    en: "No client email issues currently require coordinator review.",
    ja: "現在対応待ちの案件はありません。",
  },

  // Common UI Buttons & Form Elements
  "btn.save": {
    en: "Save Changes",
    ja: "保存する",
  },
  "btn.cancel": {
    en: "Cancel",
    ja: "キャンセル",
  },
  "btn.confirm": {
    en: "Confirm",
    ja: "確定する",
  },
  "btn.back": {
    en: "Back",
    ja: "戻る",
  },
  "btn.search": {
    en: "Search",
    ja: "検索",
  },
  "btn.filter": {
    en: "Filter",
    ja: "絞り込み",
  },
  "btn.export_csv": {
    en: "Export CSV",
    ja: "CSVエクスポート",
  },
  "btn.refresh": {
    en: "Refresh Data",
    ja: "最新データに更新",
  },
  "btn.close": {
    en: "Close",
    ja: "閉じる",
  },
  "btn.details": {
    en: "Details",
    ja: "詳細",
  },
  "btn.apply": {
    en: "Apply",
    ja: "適用",
  },
  "btn.reset": {
    en: "Reset",
    ja: "初期化",
  },
  "btn.saving": {
    en: "Saving...",
    ja: "保存中...",
  },
  "btn.loading": {
    en: "Loading...",
    ja: "読込中...",
  },

  // Pagination & General State
  "pagination.showing": {
    en: "Showing",
    ja: "表示中:",
  },
  "pagination.of": {
    en: "of",
    ja: "/",
  },
  "pagination.page": {
    en: "Page",
    ja: "ページ",
  },
  "pagination.prev": {
    en: "Previous",
    ja: "前へ",
  },
  "pagination.next": {
    en: "Next",
    ja: "次へ",
  },
  "footer.rights": {
    en: "South Asia Travel Factory Private Limited. All rights reserved.",
    ja: "South Asia Travel Factory Private Limited. 著作権所有。",
  },
  "footer.internal_use": {
    en: "Internal Operations Platform. Authorized personnel only.",
    ja: "社内運行管理システム（関係者限り）。",
  },

  // Login & Authentication Modal
  "login.modal_title": {
    en: "Coordinator Authentication",
    ja: "運行コーディネーター認証",
  },
  "login.prompt_desc": {
    en: "Enter your operations passphrase to activate authenticated coordinator actions and persistent write permissions.",
    ja: "手配更新や設定変更を行うには、運行管理パスフレーズを入力して認証してください。",
  },
  "login.passphrase_label": {
    en: "Operations Passphrase",
    ja: "運用管理パスフレーズ",
  },
  "login.passphrase_placeholder": {
    en: "Enter coordinator security passphrase...",
    ja: "パスフレーズを入力...",
  },
  "login.submit": {
    en: "Sign In as Coordinator",
    ja: "コーディネーターとしてログイン",
  },
  "login.signing_in": {
    en: "Verifying Passphrase...",
    ja: "認証照合中...",
  },
  "login.signed_in_as": {
    en: "Signed in as",
    ja: "ログイン中:",
  },
  "login.invalid_passphrase": {
    en: "Invalid passphrase. Please verify operational credentials.",
    ja: "パスフレーズが無効です。認証情報を確認してください。",
  },

  // Detailed Dashboard Translations
  "dash.operational_day": {
    en: "Operational Day:",
    ja: "運行管理基準日:",
  },
  "dash.lifecycle_breakdown": {
    en: "Tour Operations Lifecycle Breakdown",
    ja: "ツアー運行ステータス内訳",
  },
  "dash.total_roster": {
    en: "Total Roster",
    ja: "台帳総数",
  },
  "dash.active_circuits": {
    en: "Active Circuits",
    ja: "運行中周遊",
  },
  "dash.open_blockers": {
    en: "Open Blockers",
    ja: "要対応課題",
  },
  "dash.arrivals_schedule": {
    en: "Upcoming Arrivals Schedule",
    ja: "直近の到着予定スケジュール",
  },
  "dash.no_arrivals_today": {
    en: "No inbound flights scheduled today",
    ja: "本日の到着便はありません",
  },
  "dash.all_transfers_on_time": {
    en: "All transfers on schedule",
    ja: "全送迎定刻運行中",
  },
  "dash.no_transit_tours": {
    en: "No tours currently in transit",
    ja: "現在移動中のツアーはありません",
  },
  "dash.all_cleared": {
    en: "All operations cleared",
    ja: "全手配完了・課題なし",
  },
  "dash.reset_session": {
    en: "Reset Data",
    ja: "データを初期化",
  },
  "dash.session_active": {
    en: "Active Session Modifications",
    ja: "セッション変更適用中",
  },

  // Reports View
  "reports.tab_summary": {
    en: "Tours Master Summary",
    ja: "ツアー台帳総合サマリー",
  },
  "reports.tab_summary_desc": {
    en: "Operational status, passenger counts, itineraries, and assigned staff for all circuits.",
    ja: "全周遊ルートの手配状況、参加人数、旅程、配属スタッフ一覧。",
  },
  "reports.tab_manifest": {
    en: "Flight & Transfer Manifest",
    ja: "フライト・送迎マニフェスト",
  },
  "reports.tab_manifest_desc": {
    en: "Airport arrival and departure schedules, flight numbers, terminals, and transport dispatch.",
    ja: "空港到着・出発スケジュール、便名、ターミナル、送迎配車一覧。",
  },
  "reports.tab_allocations": {
    en: "Resource Allocations",
    ja: "リソース配属実績",
  },
  "reports.tab_allocations_desc": {
    en: "Staffing roster of guides, chauffeurs, and assigned fleet across dates.",
    ja: "日付ごとのガイド、ドライバー、手配車両の稼働・配属状況。",
  },
  "reports.tab_blockers": {
    en: "Open Blockers & Issues",
    ja: "未解決ブロッカー・課題",
  },
  "reports.tab_blockers_desc": {
    en: "Audit of unassigned roles, ambiguous dates, and pending operational tasks.",
    ja: "未配属リソース、日付曖昧性、確認待ちタスクの監査リスト。",
  },
  "reports.download_csv": {
    en: "Export Report (CSV)",
    ja: "レポート出力 (CSV)",
  },
  "reports.empty": {
    en: "No records found for the selected reporting parameters.",
    ja: "指定された条件に合致するレポートデータはありません。",
  },
  "reports.total_tours": {
    en: "Total Operational Tours",
    ja: "手配ツアー総数",
  },
  "reports.total_pax": {
    en: "Total Travelers",
    ja: "総旅行者数",
  },
  "reports.staffing_rate": {
    en: "Staff Allocation Rate",
    ja: "スタッフ配属率",
  },
  "reports.flight_transfers": {
    en: "Flight Transfers",
    ja: "空港・区間送迎便数",
  },
  "reports.status_distribution": {
    en: "Operational Status Breakdown",
    ja: "運行ステータス構成比",
  },
  "reports.circuit_distribution": {
    en: "Top Circuit Destinations",
    ja: "主要周遊ルート別実績",
  },
  "reports.search_placeholder": {
    en: "Search manifest by booking reference, group, destination, staff...",
    ja: "予約番号、団体名、周遊先、配属スタッフで検索...",
  },
  "reports.filter_status": {
    en: "Filter Status:",
    ja: "ステータス絞込:",
  },

  // Import Review View
  "import.title": {
    en: "Excel Workbook Import & Provenance Reconciliation",
    ja: "Excelワークブック取込・データ照合",
  },
  "import.subtitle": {
    en: "Inspect, resolve date ambiguities, and safely dry-run or activate operational tours.",
    ja: "日付曖昧性の解消、事前検証（ドライラン）、ツアー台帳への安全な取込・反映。",
  },
  "import.dry_run": {
    en: "Execute Dry-Run Preview",
    ja: "ドライラン検証を実行",
  },
  "import.commit_import": {
    en: "Commit Live Import",
    ja: "本番取込を実行",
  },
  "import.committing": {
    en: "Committing Import...",
    ja: "取込処理中...",
  },
  "import.staged_workbook": {
    en: "Staged Operational Workbook",
    ja: "ステージング済ワークブック",
  },
  "import.canonical_count": {
    en: "Canonical Tours",
    ja: "正規化ツアー件数",
  },
  "import.would_insert": {
    en: "Will Insert",
    ja: "新規登録予定",
  },
  "import.would_update": {
    en: "Will Update",
    ja: "更新予定",
  },
  "import.would_skip": {
    en: "Unchanged / Skipped",
    ja: "変更なし・スキップ",
  },
  "import.conflicts": {
    en: "Flagged Conflicts",
    ja: "競合検出",
  },
  "import.ambiguities": {
    en: "Unresolved Date Decisions",
    ja: "未解決の日付判定",
  },
  "import.dry_run_success": {
    en: "Dry-run completed successfully with zero schema conflicts.",
    ja: "ドライランが正常に完了しました（競合・エラーなし）。",
  },
  "import.confirm_modal_title": {
    en: "Confirm Operational Data Activation",
    ja: "本番データ取込の確認",
  },
  "import.confirm_modal_desc": {
    en: "You are about to insert and update operational tours in the live database. This action will write persistent audit records.",
    ja: "本番データベースへツアーデータを登録・更新します。この操作は監査ログに記録されます。",
  },
  "import.confirm_checkbox": {
    en: "I confirm that all date decisions and tour metrics have been reviewed.",
    ja: "すべての日付判定およびツアー件数を確認・承認しました。",
  },

  // Settings View
  "settings.storage_title": {
    en: "Browser Session & Local Overrides",
    ja: "ブラウザセッション・ローカル変更",
  },
  "settings.storage_desc": {
    en: "Manage temporary client-side coordinator edits and storage quota.",
    ja: "一時的なコーディネーター編集データおよびストレージ使用量の管理。",
  },
  "settings.clear_session": {
    en: "Reset Local Session Overrides",
    ja: "ローカル変更をリセット",
  },
  "settings.database_status": {
    en: "Database Connection Status",
    ja: "データベース接続状態",
  },
  "settings.database_connected": {
    en: "Connected to Supabase Datastore",
    ja: "Supabaseデータベース接続中",
  },
  "settings.database_unconfigured": {
    en: "Database Unconfigured (Local Mock Mode)",
    ja: "データベース未接続（ローカルモック稼働中）",
  },
  "settings.audit_logs": {
    en: "Operational Audit Log Records",
    ja: "運行管理監査ログ件数",
  },

  // Tour Detail Translations
  "detail.back_to_roster": {
    en: "Back to Tours Roster",
    ja: "ツアー台帳に戻る",
  },
  "detail.not_found": {
    en: "Tour Record Not Found",
    ja: "ツアー記録が見つかりません",
  },
  "detail.session_modified": {
    en: "Session Modified",
    ja: "セッション変更適用中",
  },
  "detail.reset_tour": {
    en: "Reset Tour",
    ja: "変更をリセット",
  },
  "detail.cancel_tour": {
    en: "Cancel Tour",
    ja: "ツアーをキャンセル",
  },
  "detail.update_ops": {
    en: "Update Operations",
    ja: "手配・配属を編集",
  },
  "detail.cancelled_banner": {
    en: "TOUR CANCELLED",
    ja: "ツアーキャンセル済",
  },
  "detail.cancelled_on": {
    en: "Cancelled on",
    ja: "キャンセル日時",
  },
  "detail.cancellation_reason": {
    en: "Reason:",
    ja: "理由:",
  },
  "detail.party_size": {
    en: "Party Size",
    ja: "参加人数",
  },
  "detail.inbound_arrival": {
    en: "Inbound Arrival",
    ja: "往路到着便",
  },
  "detail.outbound_departure": {
    en: "Outbound Departure",
    ja: "復路出発便",
  },
  "detail.assigned_guide": {
    en: "Assigned Guide",
    ja: "担当ガイド",
  },
  "detail.unassigned": {
    en: "Unassigned",
    ja: "未配属",
  },
  "detail.nights": {
    en: "Nights",
    ja: "泊",
  },
  "detail.days": {
    en: "Days",
    ja: "日",
  },
  "detail.primary_contact": {
    en: "Primary Contact:",
    ja: "代表連絡先:",
  },
  "detail.group_ref": {
    en: "Group Ref:",
    ja: "予約参照番号:",
  },
  "detail.adults": {
    en: "Adults",
    ja: "大人",
  },
  "detail.children": {
    en: "Children",
    ja: "子供",
  },
  "detail.pax": {
    en: "pax",
    ja: "名",
  },
  "detail.tracked_issues": {
    en: "Tracked Operational Issues",
    ja: "運行管理課題・ブロッカー",
  },
  "detail.itinerary": {
    en: "Operational Itinerary",
    ja: "運行行程表",
  },
  "detail.itinerary_desc": {
    en: "Chronological schedule of transfers, sightseeing, and activities",
    ja: "送迎、観光、アクティビティの日程一覧",
  },
  "detail.flights": {
    en: "Flights & Transport Bookings",
    ja: "フライト・交通手配",
  },
  "detail.flights_desc": {
    en: "International and regional transit bookings",
    ja: "国際線および国内区間交通手配一覧",
  },
  "detail.accommodations": {
    en: "Hotel Accommodations",
    ja: "宿泊ホテル手配",
  },
  "detail.accommodations_desc": {
    en: "Confirmed hotel bookings across tour itinerary",
    ja: "周遊ルート上の確定宿泊ホテル一覧",
  },
  "detail.assigned_personnel": {
    en: "Assigned Operations Staff & Fleet",
    ja: "配属スタッフ・専属車両",
  },
  "detail.assigned_personnel_desc": {
    en: "Active guides, chauffeurs, and vehicles assigned to this tour",
    ja: "本ツアーに配属されているガイド、ドライバー、車両",
  },

  // Modal Translations
  "modal.edit_tour": {
    en: "Edit Tour Operations",
    ja: "ツアー手配・運行情報の編集",
  },
  "modal.create_tour": {
    en: "Register New Operational Tour",
    ja: "新規ツアー台帳登録",
  },
  "modal.guide_allocation": {
    en: "Guide Allocation",
    ja: "ガイド配属",
  },
  "modal.driver_vehicle": {
    en: "Driver & Vehicle Allocation",
    ja: "ドライバー・車両配属",
  },
  "modal.operational_notes": {
    en: "Operational Notes & Dispatch Instructions",
    ja: "運行連絡事項・指示書",
  },
  "modal.save_changes": {
    en: "Save Changes",
    ja: "変更を保存",
  },
  "modal.cancel": {
    en: "Cancel",
    ja: "キャンセル",
  },

  // Excel Import Manager Translations
  "import_mgr.title": {
    en: "Excel Operational Workbook Staging & Ingestion",
    ja: "Excel運行ワークブック取込・データ反映",
  },
  "import_mgr.operator_auth": {
    en: "Coordinator Authentication Required",
    ja: "運行管理者認証が必要です",
  },
  "import_mgr.operator_unlocked": {
    en: "Coordinator Active",
    ja: "コーディネーター認証済",
  },
  "import_mgr.staged_ready": {
    en: "Staged Workbook Available",
    ja: "ステージング済ワークブック利用可能",
  },
  "import_mgr.dry_run": {
    en: "Execute Dry-Run Preview",
    ja: "ドライラン検証を実行",
  },
  "import_mgr.commit": {
    en: "Commit Import to Production",
    ja: "本番データベースへ反映",
  },
  "import_mgr.real_data_active": {
    en: "Real Operational Data Active",
    ja: "本番運行データ適用中",
  },
  "import_mgr.demo_data_active": {
    en: "Demo Mock Data Active",
    ja: "デモ用モックデータ適用中",
  },
  "import_mgr.loading_dataset": {
    en: "Loading dataset state…",
    ja: "データセット状態を読込中…",
  },
  "import_mgr.canonical_tours": {
    en: "Canonical Tours",
    ja: "正規化ツアー台帳",
  },
  "import_mgr.sheets_parsed": {
    en: "Sheets Parsed",
    ja: "解析済シート数",
  },
  "import_mgr.spanning_merged": {
    en: "Spanning Merged",
    ja: "統合済重複ツアー",
  },
  "import_mgr.date_ambiguities": {
    en: "Date Ambiguities",
    ja: "日付曖昧性判定",
  },
  "import_mgr.source_workbook": {
    en: "Source Workbook:",
    ja: "取込元ワークブック:",
  },
  "import_mgr.imported_on": {
    en: "Imported",
    ja: "取込日時",
  },
  "import_mgr.download_audit_report": {
    en: "Download Audit Report (CSV)",
    ja: "監査照合レポート出力 (CSV)",
  },
  "import_mgr.switch_to_demo": {
    en: "Switch to Demo Mode",
    ja: "デモモードに切替",
  },
  "import_mgr.switch_to_operational": {
    en: "Switch to Operational Data",
    ja: "本番運用データに切替",
  },
  "import_mgr.switching": {
    en: "Switching...",
    ja: "切替中...",
  },
  "import_mgr.no_dataset_title": {
    en: "No Operational Dataset Imported Yet",
    ja: "運用データセット未取込",
  },
  "import_mgr.no_dataset_desc": {
    en: "The platform is currently operating in demo mock data mode. You can stage, preview, and ingest the historical and active seasonal workbooks from the local desktop directory.",
    ja: "現在デモモードで稼働しています。ローカルのExcel運行ワークブックをステージング・プレビュー検証・本番取込できます。",
  },
  "import_mgr.stage_workbook_title": {
    en: "Stage or Upload Operational Workbook",
    ja: "Excel運行ワークブックのステージング・アップロード",
  },
  "import_mgr.stage_workbook_desc": {
    en: "Select a seasonal chart workbook (.xls / .xlsx) to parse canonical tour blocks, resolve date formats, and prepare for production datastore ingestion.",
    ja: "年間チャート運行表（.xls / .xlsx）を選択し、ツアー台帳の抽出・日付判定・本番反映の事前検証を行います。",
  },
  "import_mgr.workbook_scope": {
    en: "Workbook Ingestion Scope",
    ja: "ワークブック解析対象",
  },
  "import_mgr.all_seasons": {
    en: "All Seasons (Full 91 Sheets)",
    ja: "全シーズン（全91シート）",
  },
  "import_mgr.season_2025_2026": {
    en: "Season 2025-2026 (Active, 16 Sheets)",
    ja: "2025-2026年度（最新運行・16シート）",
  },
  "import_mgr.season_2024_2025": {
    en: "Season 2024-2025",
    ja: "2024-2025年度",
  },
  "import_mgr.season_2023_2024": {
    en: "Season 2023-2024",
    ja: "2023-2024年度",
  },
  "import_mgr.season_2018_2019": {
    en: "Season 2018-2019",
    ja: "2018-2019年度",
  },
  "import_mgr.season_2015_2016": {
    en: "Season 2015-2016",
    ja: "2015-2016年度",
  },
  "import_mgr.upload_custom_title": {
    en: "Upload Custom / Alternate Workbook",
    ja: "個別ワークブックをアップロード",
  },
  "import_mgr.upload_custom_desc": {
    en: "Select an .xls or .xlsx file (max 25 MB). Magic-byte format verification will run automatically.",
    ja: "Excel形式（.xls / .xlsx、上限25MB）のファイルを選択。ファイル形式の整合性を自動検証します。",
  },
  "import_mgr.choose_file": {
    en: "Choose Excel File",
    ja: "Excelファイルを選択",
  },
  "import_mgr.change_file": {
    en: "Change File",
    ja: "ファイルを変更",
  },
  "import_mgr.drag_drop": {
    en: "or drag and drop here",
    ja: "またはここにドラッグ＆ドロップ",
  },
  "import_mgr.staged_detected": {
    en: "Staged Desktop Workbook Detected",
    ja: "ステージング済ローカルワークブック検出",
  },
  "import_mgr.auditing_workbook": {
    en: "Auditing Workbook...",
    ja: "ワークブック解析中...",
  },
  "import_mgr.tab_summary": {
    en: "Parse Summary",
    ja: "解析サマリー",
  },
  "import_mgr.tab_ambiguities": {
    en: "Date Ambiguities",
    ja: "日付判定",
  },
  "import_mgr.tab_duplicates": {
    en: "Spanning Tours",
    ja: "統合重複ツアー",
  },
  "import_mgr.tab_preview": {
    en: "Tour Roster Preview",
    ja: "台帳プレビュー",
  },
  "import_mgr.total_blocks": {
    en: "Total Tour Blocks",
    ja: "抽出ツアーブロック総数",
  },
  "import_mgr.unassigned_guides": {
    en: "Unassigned Guides",
    ja: "ガイド未配属",
  },
  "import_mgr.sheet_name": {
    en: "Sheet Name",
    ja: "シート名",
  },
  "import_mgr.season": {
    en: "Season",
    ja: "シーズン",
  },
  "import_mgr.rows": {
    en: "Rows",
    ja: "行数",
  },
  "import_mgr.tours_detected": {
    en: "Tours Detected",
    ja: "検出ツアー数",
  },
  "import_mgr.ambiguity_preserved": {
    en: "Ambiguity Rule Faithfully Preserved:",
    ja: "適用された日付曖昧性ルール:",
  },
  "import_mgr.sheet": {
    en: "Sheet",
    ja: "シート",
  },
  "import_mgr.raw_serial": {
    en: "Raw Serial",
    ja: "元データ表記",
  },
  "import_mgr.ambiguity_reason": {
    en: "Ambiguity Reason",
    ja: "判定理由",
  },
  "import_mgr.sheets_occurring": {
    en: "Sheets Occurring",
    ja: "対象シート",
  },
  "import_mgr.source_rows": {
    en: "Source Rows",
    ja: "元データ行",
  },
  "import_mgr.resolution": {
    en: "Resolution",
    ja: "統合結果",
  },
  "import_mgr.booking_ref": {
    en: "Booking Ref",
    ja: "予約番号",
  },
  "import_mgr.dates": {
    en: "Dates",
    ja: "日程",
  },
  "import_mgr.destination": {
    en: "Destination",
    ja: "周遊先",
  },
  "import_mgr.agency": {
    en: "Agency",
    ja: "手配旅行会社",
  },
  "import_mgr.guide": {
    en: "Guide",
    ja: "担当ガイド",
  },
  "import_mgr.source": {
    en: "Source",
    ja: "データ元",
  },
  "import_mgr.confirm_title": {
    en: "Confirm Operational Dataset Import",
    ja: "運行データセット本番反映の確認",
  },
  "import_mgr.confirm_desc": {
    en: "Explicit confirmation required",
    ja: "本番反映の確認が必要です",
  },
  "import_mgr.confirm_replace": {
    en: "Will replace active demo mock tours across the platform.",
    ja: "プラットフォーム全体のデモモックデータを実運用データに置き換えます。",
  },
  "import_mgr.confirm_persist": {
    en: "Data persists permanently in server storage (survives refresh).",
    ja: "データはサーバー永続ストレージに保存されます（リロード後も保持）。",
  },
  "import_mgr.confirm_flags": {
    en: "All dates, references, and ambiguity flags will be preserved.",
    ja: "すべての日程、参照番号、曖昧性フラグが保持されます。",
  },
  "import_mgr.committing": {
    en: "Committing...",
    ja: "反映中...",
  },

  // Tour Creation Modal Translations
  "create.title": {
    en: "Register New Operational Tour",
    ja: "新規ツアー台帳登録",
  },
  "create.subtitle": {
    en: "Register a new group itinerary in the operations dispatch system",
    ja: "運行管理システムに新しいグループ旅程を登録します",
  },
  "create.error_title": {
    en: "Creation Failed",
    ja: "登録に失敗しました",
  },
  "create.section_identity": {
    en: "Tour Reference & Identity",
    ja: "ツアー基本情報・識別番号",
  },
  "create.booking_ref": {
    en: "Booking Reference",
    ja: "予約番号",
  },
  "create.group_name": {
    en: "Tour Group Name",
    ja: "ツアー団体名",
  },
  "create.destination": {
    en: "Destination Circuit",
    ja: "周遊先・行程",
  },
  "create.guest_name": {
    en: "Lead Passenger (Guest Name)",
    ja: "代表旅行者名",
  },
  "create.section_dates": {
    en: "Circuit Dates & Passenger Numbers",
    ja: "日程・参加人数",
  },
  "create.adults": {
    en: "Total Adults",
    ja: "大人人数",
  },
  "create.children": {
    en: "Total Children",
    ja: "子供人数",
  },
  "create.arrival_date": {
    en: "Arrival Date",
    ja: "到着日",
  },
  "create.departure_date": {
    en: "Departure Date",
    ja: "出発日",
  },
  "create.section_resources": {
    en: "Initial Resource Allocations (Optional)",
    ja: "初期リソース配属（任意）",
  },
  "create.guide_name": {
    en: "Assigned Guide Name",
    ja: "担当ガイド名",
  },
  "create.driver_name": {
    en: "Assigned Driver Name",
    ja: "担当ドライバー名",
  },
  "create.section_remarks": {
    en: "Operational Remarks & Special Requests",
    ja: "運行指示・特別手配事項",
  },
  "create.remarks_placeholder": {
    en: "Add VIP requests, dietary preferences, or flight handover remarks…",
    ja: "VIP要望、食事制限、空港送迎申し送り事項など…",
  },
  "create.cancel": {
    en: "Cancel",
    ja: "キャンセル",
  },
  "create.submit": {
    en: "Register Tour File",
    ja: "ツアー台帳を登録",
  },
  "create.submitting": {
    en: "Creating...",
    ja: "登録処理中...",
  },

  // Tour Edit Modal Translations
  "edit.title": {
    en: "Update Operations",
    ja: "ツアー手配・運行情報更新",
  },
  "edit.session_notice": {
    en: "Prototype Session: Modifications are cached locally in this browser session.",
    ja: "セッション通知: 編集内容は本ブラウザセッションに保存されます。",
  },
  "edit.guide_section": {
    en: "Guide Allocation",
    ja: "ガイド配属管理",
  },
  "edit.guide_name": {
    en: "Guide Name",
    ja: "ガイド氏名",
  },
  "edit.guide_id": {
    en: "Guide License / ID",
    ja: "公認ガイド番号・ライセンスID",
  },
  "edit.guide_contact": {
    en: "Guide Mobile",
    ja: "ガイド連絡先",
  },
  "edit.guide_status": {
    en: "Guide Status",
    ja: "手配ステータス",
  },
  "edit.vehicle_section": {
    en: "Vehicle & Driver Allocation",
    ja: "車両・ドライバー配属管理",
  },
  "edit.vehicle_plate": {
    en: "License Plate",
    ja: "車両ナンバー",
  },
  "edit.driver_name": {
    en: "Driver Name",
    ja: "ドライバー氏名",
  },
  "edit.driver_contact": {
    en: "Driver Mobile",
    ja: "ドライバー連絡先",
  },
  "edit.vehicle_type": {
    en: "Vehicle Type / Specs",
    ja: "車種・定員仕様",
  },
  "edit.hotel_section": {
    en: "Hotel Booking Voucher",
    ja: "宿泊ホテル手配バウチャー",
  },
  "edit.hotel_name": {
    en: "Hotel Property Name",
    ja: "ホテル名",
  },
  "edit.hotel_voucher": {
    en: "Booking Voucher / Confirmation #",
    ja: "バウチャー番号・予約確認番号",
  },
  "edit.hotel_status": {
    en: "Hotel Status",
    ja: "ホテル手配状態",
  },
  "edit.issues_section": {
    en: "Operational Blockers & Issues",
    ja: "運行課題・特記事項",
  },
  "edit.issue_desc": {
    en: "Blocker Description",
    ja: "課題詳細",
  },
  "edit.notes_section": {
    en: "Internal Operations Notes",
    ja: "運行管理デスク申し送り事項",
  },
  "edit.save": {
    en: "Save Changes",
    ja: "変更を保存",
  },
  "edit.saving": {
    en: "Saving...",
    ja: "保存中...",
  },

  // Tour Detail Additional Translations
  "detail.dispatch_note": {
    en: "Dispatch Note:",
    ja: "配車指示事項:",
  },
  "detail.note": {
    en: "Note:",
    ja: "特記事項:",
  },
  "detail.col_date": {
    en: "Date",
    ja: "日付",
  },
  "detail.col_schedule": {
    en: "Schedule",
    ja: "運行スケジュール",
  },
  "detail.col_airline": {
    en: "Airline",
    ja: "航空会社",
  },
  "detail.col_terminal": {
    en: "Terminal",
    ja: "ターミナル",
  },
  "detail.col_flight": {
    en: "Flight",
    ja: "便名",
  },
  "detail.col_time": {
    en: "Time",
    ja: "時刻",
  },
  "detail.special_requests": {
    en: "Special Requests & Dietary",
    ja: "特別要望・食事制限",
  },
  "detail.cancel_modal_title": {
    en: "Cancel Tour Itinerary",
    ja: "ツアー行程のキャンセル",
  },
  "detail.cancel_modal_desc": {
    en: "Provide an explicit cancellation reason for the dispatch log:",
    ja: "運行管理記録用のキャンセル理由を入力してください:",
  },
  "detail.cancel_reason_placeholder": {
    en: "e.g. Guest requested cancellation due to medical emergency / flight schedule disrupted",
    ja: "例: お客様の急病によるキャンセル要請 / 航空便大幅乱れのため",
  },
  "detail.confirm_cancel": {
    en: "Confirm Cancellation",
    ja: "キャンセルを確定",
  },

  // Client Issues Additional Translations
  "issues.all_issues": {
    en: "All Issues",
    ja: "すべての案件",
  },
  "issues.all_priorities": {
    en: "All Priorities",
    ja: "すべての優先度",
  },
  "issues.inbox_title": {
    en: "Inbound Communications Inbox",
    ja: "顧客・旅行会社 受信トレイ",
  },
  "issues.session_edits_active": {
    en: "session edits active",
    ja: "件のローカル編集適用中",
  },
  "issues.empty_desc": {
    en: "When clients or overseas travel agents send flight adjustment notices or inquiries to the inbound address, they will appear here in real-time.",
    ja: "お客様や海外旅行会社からのフライト変更通報や緊急連絡は、ここに即時反映されます。",
  },
  "issues.modal_category": {
    en: "Category:",
    ja: "分類:",
  },
  "issues.modal_priority": {
    en: "Priority:",
    ja: "優先度:",
  },
  "issues.modal_linked_tour": {
    en: "Linked Tour:",
    ja: "関連ツアー:",
  },
  "issues.modal_mgmt_title": {
    en: "Coordinator Assignment & Status",
    ja: "コーディネーター担当・対応状況",
  },
  "issues.modal_status_label": {
    en: "Status",
    ja: "対応ステータス",
  },
  "issues.modal_coordinator_label": {
    en: "Assigned Coordinator",
    ja: "担当コーディネーター",
  },
  "issues.modal_coordinator_placeholder": {
    en: "e.g., Coordinator Tanaka",
    ja: "例: 田中コーディネーター",
  },
  "issues.modal_persistence_note": {
    en: "Modifications persist in current browser profile until database table is migrated.",
    ja: "編集内容はデータベース同期まで本ブラウザプロファイルに保存されます。",
  },
  "issues.modal_save": {
    en: "Save",
    ja: "保存",
  },
  "issues.modal_saved": {
    en: "Saved!",
    ja: "保存完了",
  },
  "issues.page_showing": {
    en: "Showing Page",
    ja: "ページ表示中",
  },
  "issues.page_of": {
    en: "of",
    ja: "/",
  },

  // Assignments Additional Translations
  "assign.conflict_title": {
    en: "OPERATIONAL ALLOCATION CONFLICT DETECTED",
    ja: "運行リソース重複配属警告",
  },
  "assign.conflict_desc": {
    en: "The system detected overlapping dates for the same assigned field resource across active tours. Double-booked staff cannot service multiple concurrent circuit itineraries:",
    ja: "同一スタッフ・車両の重複配属が検知されました。同日程で複数の周遊旅程を掛け持ちすることはできません:",
  },
  "assign.showing_conflicts": {
    en: "Showing first 5 of",
    ja: "全",
  },
  "assign.conflicts_label": {
    en: "allocation conflicts.",
    ja: "件中 5件の重複配属を表示中。",
  },
  "assign.filter_all_conflicts": {
    en: "Filter list by all conflicts →",
    ja: "重複警告の全件を表示 →",
  },

  // Calendar Additional Translations
  "cal.movement_arrival": {
    en: "ARRIVAL",
    ja: "到着",
  },
  "cal.movement_departure": {
    en: "DEPARTURE",
    ja: "出発",
  },
  "cal.movement_circuit": {
    en: "CIRCUIT",
    ja: "周遊",
  },
  "cal.guests_count": {
    en: "Guests",
    ja: "名",
  },

  // Settings Additional Translations
  "settings.storage_warning": {
    en: "Storage Warning:",
    ja: "ストレージ警告:",
  },
  "settings.storage_warning_desc": {
    en: "Could not read session modifications. The browser storage driver may be restricted or blocked.",
    ja: "セッション保存データを読み込めませんでした。ブラウザのストレージアクセスが制限されている可能性があります。",
  },
  "settings.runtime_badge": {
    en: "SATF Operations Runtime",
    ja: "SATF 運行管制ランタイム",
  },
  "settings.optimistic_concurrency": {
    en: "Optimistic Concurrency (Version Locking)",
    ja: "楽観的排他制御 (バージョンロック)",
  },
  "settings.relational_acid": {
    en: "Strict Relational ACID",
    ja: "厳格なリレーショナルACID特性",
  },
  "settings.fail_closed_enforced": {
    en: "Enforced on Disconnection",
    ja: "切断時に自動施行 (安全終了)",
  },

  // Common Platform Translations
  "common.golden_triangle": {
    en: "Golden Triangle Circuit",
    ja: "ゴールデントライアングル周遊ルート",
  },
  "common.holy_ganges": {
    en: "Holy Ganges & Varanasi Segment",
    ja: "聖地ガンジス・バラナシ周遊",
  },
  "common.ops_desk": {
    en: "Operations Desk",
    ja: "運行管理デスク",
  },
  "common.active_dispatch": {
    en: "Active Dispatch",
    ja: "配車管制中",
  },
  "common.parent_company": {
    en: "Associated with ST WORLD (Tokyo, Japan)",
    ja: "株式会社エス・ティー・ワールド（東京）提携",
  },
  "common.inbound_mgmt": {
    en: "Inbound Destination Management",
    ja: "インバウンド地上手配・運行統括",
  },
};

/**
 * Helper to fetch a translated string with fallback to English or the key.
 */
export function getTranslation(key: string, lang: SupportedLanguage = "en"): string {
  const item = TRANSLATIONS[key];
  if (!item) return key;
  return item[lang] || item.en || key;
}
