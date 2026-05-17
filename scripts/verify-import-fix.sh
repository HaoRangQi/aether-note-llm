#!/bin/bash
# 验证导入功能修复的测试脚本

set -e

echo "🧪 Aether 导入功能修复验证"
echo "================================"
echo ""

# 1. 运行单元测试
echo "📋 1. 运行单元测试..."
cd packages/core
npm test -- pipeline-error-handling.test.ts --reporter=verbose
echo "✅ 单元测试通过"
echo ""

# 2. 检查编译
echo "📦 2. 检查编译..."
npm run build
cd ../plugin
npm run build
echo "✅ 编译成功"
echo ""

# 3. 验证修改的文件
echo "📝 3. 验证修改的文件..."
FILES=(
  "packages/plugin/src/modals/import-modal.ts"
  "packages/core/src/import/pipeline.ts"
  "packages/core/tests/unit/import/pipeline-error-handling.test.ts"
  "docs/troubleshooting/import-issues.md"
  "CHANGELOG.md"
)

for file in "${FILES[@]}"; do
  if [ -f "../../$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file (缺失)"
    exit 1
  fi
done
echo ""

# 4. 检查关键代码片段
echo "🔍 4. 检查关键修复..."

cd ../..

# 检查 ImportModal 的错误处理
if grep -q "catch (e)" packages/plugin/src/modals/import-modal.ts && \
   grep -q "e.type === \"error\"" packages/plugin/src/modals/import-modal.ts; then
  echo "  ✓ ImportModal 错误处理已添加"
else
  echo "  ✗ ImportModal 错误处理缺失"
  exit 1
fi

# 检查 Pipeline 的错误处理
if grep -q "try {" packages/core/src/import/pipeline.ts && \
   grep -q "yield { type: \"error\"" packages/core/src/import/pipeline.ts; then
  echo "  ✓ Pipeline 错误处理已添加"
else
  echo "  ✗ Pipeline 错误处理缺失"
  exit 1
fi

# 检查 proposeMetadata 的 fallback
if grep -q "proposeMetadata failed, using fallback" packages/core/src/import/pipeline.ts; then
  echo "  ✓ proposeMetadata fallback 已添加"
else
  echo "  ✗ proposeMetadata fallback 缺失"
  exit 1
fi

echo ""
echo "================================"
echo "✅ 所有验证通过！"
echo ""
echo "📚 下一步："
echo "  1. 在 Obsidian 中测试插件"
echo "  2. 查看控制台日志验证错误提示"
echo "  3. 参考 docs/troubleshooting/import-issues.md"
