# 設計図：最短購買動線 v2（0/a/b）

作成: 2026-07-15 ／ ステータス: ✅ 承認済み（「0,a,bを実装しましょう」）→ 実装
目的: 着地→購入完了を 9タップ＋Stripe → **実質5〜6タップ＋Stripe** に短縮。

## 変更内容

### 0. プランセクションを HERO 直下へ移動
- AppPage の `<PlansSection>` ブロックをサポートバンドの前（HERO直後）へ移動（JSX順序変更のみ）。
- 「価格・選択肢が0スクロール強で見える」を実現。互換性チェッカーが後ろに下がる不安は今後の N4（ドロワー内互換ヒント）でカバー。

### a. ドロワーの価格確認ステップ（Step2Confirm）を削除
- プランカードには価格表示済み・ログイン画面に YOUR SELECTION・決済画面に ORDER SUMMARY＋通貨切替があり、確認ステップは同一情報の3重表示のため削除。
- 新ステップ構成（6→5）: **0=Plan / 1=Login / 2=Payment / 3=Complete / 4=eSIM**
- 数値参照の更新: PurchaseDrawer switch・esim購読 enabled(5→4)・AppPage 決済完了復帰(5→4)・Step3Login の back/Change(→0)・continue(→2)・Step4Payment back(→0 ※loginは自動前進するため plan へ戻す)・stepLabels(5→4ラベル・5言語)・インジケータ clickable(plan のみ)・各テスト。
- `Step2Confirm.tsx` / `Step2Confirm.test.tsx` は削除。

### b. ログイン済み/成功時の自動前進
- `Step3Login` に effect 追加: `!loading && isAuthenticated → setStep(2)`。
  - 新規ユーザー: Google ポップアップ成功 → 自動で決済へ（「Continue」タップ廃止）
  - ログイン済みユーザー: プランタップ → **ログイン画面を経由せず即決済**（共有リンク/再購入も同様）
- ループ防止: Payment の back は 0（Plan）に向けるため、login への逆流なし。

## 新しい動線
```
組: 新規       ①Buyまたはカード → ②(カード選択) → ③Sign in → ④Google選択 →(自動)→ ⑤返金同意ほか1 → ⑥Proceed → Stripe
組: ログイン済 ①カード選択 →(自動)→ ②同意 → ③Proceed → Stripe   ※再購入ボタンも同様
```

## 影響範囲・リスク
- クライアントのみ（functions/Rules 無変更）。決済契約・同意記録は不変。
- リスク: ステップ再配線ミス → 全数値参照をユニット/統合テストで担保（前回 plan-selector 改修と同一パターン）。
- 通貨切替は決済ステップ＋ページのプランセクションに残存（確認ステップ分は重複だった）。

## 検証
tsc / vitest（期待値更新含む）/ build / prerender ／ localhost で未ログイン動線（プラン→ログイン表示）を実確認 ／ dev チャンネルでログイン済み動線（プラン→即決済）を確認。
