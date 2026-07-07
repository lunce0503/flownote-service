import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// FSD 레이어 경계 규칙.
// - 상향 import 금지: 하위 레이어는 상위 레이어를 모른다.
// - 동일 레이어 교차 슬라이스 alias 금지: 슬라이스 내부는 상대경로, 교차는 금지.
// - 심층 import 금지: 다른 슬라이스는 Public API(@/레이어/슬라이스)로만 접근.
const deepImportPatterns = [
  '@/entities/*/api/**',
  '@/entities/*/model/**',
  '@/entities/*/ui/**',
  '@/features/*/api/**',
  '@/features/*/model/**',
  '@/features/*/ui/**',
]

const fsdLayerRules = (layer, upperLayers, sameLayerBan) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...(upperLayers.length
            ? [{
                // alias 경로와 상대경로 우회를 모두 차단
                group: upperLayers.flatMap((upper) => [`@/${upper}/**`, `**/${upper}/**`]),
                message: `FSD: ${layer} 레이어는 상위 레이어(${upperLayers.join(', ')})를 import할 수 없습니다.`,
              }]
            : []),
          ...(sameLayerBan
            ? [{
                group: [`@/${layer}/**`],
                message: `FSD: 같은 레이어(${layer}) 내부는 상대경로를 사용하고, 교차 슬라이스 참조는 금지합니다.`,
              }]
            : []),
          {
            group: deepImportPatterns,
            message: 'FSD: 슬라이스 Public API(@/레이어/슬라이스)로 import하세요.',
          },
        ],
      },
    ],
  },
})

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  fsdLayerRules('shared', ['entities', 'features', 'widgets', 'pages', 'app'], true),
  fsdLayerRules('entities', ['features', 'widgets', 'pages', 'app'], true),
  fsdLayerRules('features', ['widgets', 'pages', 'app'], true),
  fsdLayerRules('widgets', ['pages', 'app'], true),
  fsdLayerRules('pages', ['app'], true),
  fsdLayerRules('app', [], false),
])
