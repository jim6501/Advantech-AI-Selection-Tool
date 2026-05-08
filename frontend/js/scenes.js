/* ═══════════════════════════════════════════════════════════
   Scene Templates — 應用場景模板定義
   ─────────────────────────────────────────────────────────
   維護說明：
   - 每個場景的 conditions 陣列，每筆帶 key / value / priority
   - priority: "required" = 必選（藍色，不可移除）
               "suggested" = 建議（橘色，可移除）
   - UNSUPPORTED_CONDITION_KEYS: DB 欄位尚未就緒的 key，
     只做顯示用 tag，不加入 API 查詢（待認證欄位確認後移除）
   ═══════════════════════════════════════════════════════════ */

const UNSUPPORTED_CONDITION_KEYS = ['certifications'];

const SCENE_TEMPLATES = [
    {
        id: 'railway',
        label: '鐵路車載',
        icon: '🚆',
        description: 'EN 50155 · −40°C',
        conditions: [
            { key: 'mgmtType', value: 'managed', priority: 'required' },
            { key: 'certifications', value: ['EN50155'], priority: 'required' },
            { key: 'tempGrade', value: 'wide', priority: 'required' },
        ]
    },
    {
        id: 'power',
        label: '電力系統',
        icon: '⚡',
        description: 'IEC 61850 · Ring',
        conditions: [
            { key: 'mgmtType', value: 'managed', priority: 'required' },
            { key: 'certifications', value: ['IEC61850'], priority: 'required' },
            { key: 'tempGrade', value: 'wide', priority: 'suggested' },
        ]
    },
    {
        id: 'factory',
        label: '智慧工廠',
        icon: '🏭',
        description: 'PoE',
        conditions: [
            { key: 'poe', value: true, priority: 'required' },
            { key: 'mgmtType', value: 'managed', priority: 'suggested' }
        ]
    },
    {
        id: 'maritime',
        label: '港口海事',
        icon: '⚓',
        description: 'IEC 60945 · 防腐',
        conditions: [
            { key: 'mgmtType', value: 'managed', priority: 'required' },
            { key: 'certifications', value: ['IEC60945'], priority: 'required' },
            { key: 'tempGrade', value: 'wide', priority: 'suggested' },
        ]
    }
];

// ─────────────────────────────────────────────
// 條件 key → 前端顯示標籤
// ─────────────────────────────────────────────
function getConditionDisplayLabel(cond) {
    switch (cond.key) {
        case 'mgmtType':
            return cond.value === 'managed' ? '⚙ Managed' : '⚙ Unmanaged';
        case 'numPorts':
            return `🔌 ≥${cond.value} Port`;
        case 'poe':
            return '⚡ PoE 支援';
        case 'tempGrade':
            return '🌡 Wide Temp (−40°C)';
        case 'certifications':
            return `📋 ${cond.value.join(' / ')}`;
        default:
            return cond.key;
    }
}
