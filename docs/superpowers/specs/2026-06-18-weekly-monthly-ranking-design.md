# 주간·월간 종목 랭킹 점수 재설계

작성일: 2026-06-18

## 배경 / 문제

현재 일간·주간·월간 랭킹이 사실상 같은 공식을 쓴다. 가장 큰 비중인
`mentionScore`(최대 100)가 **"가장 최근 방송일 하루"의 방송 수**만 반영하기 때문에,
오늘 여러 방송에 나온 종목은 주간·월간에서도 동일하게 상위에 오른다.

실측: LIG넥스원이 일/주/월 모두 rawScore 123, 3위로 동일 (mention 100 · tag 20 · cont 3).
→ 월간이 "한 달간 꾸준히 다뤄진 종목"을 반영하지 못함.

## 목표

주간·월간 순위를 **꾸준함(기간 중 며칠 나왔나) 중심**으로 재설계한다.
"오늘 진입" 종목은 주간·월간에서 자연히 하위로 내려가야 한다.

- **일간은 변경하지 않는다** ("오늘의 PICK" = 오늘 화제 종목 그대로).
- 주간·월간만 새 공식 적용.

## 점수 공식 (주간·월간)

기간 거래일 수: 주간 `periodDays = 5`, 월간 `periodDays = 22`.
집계 윈도우 = 해당 기간 거래일(주간 5일 / 월간 22일).

| 항목 | 최대 | 계산 |
|---|---|---|
| 꾸준함(consistencyScore) | 60 | `min(mentionedDays / periodDays, 1) × 60` |
| 누적 언급(volumeScore) | 30 | `min(totalMentions / (periodDays × 3), 1) × 30` |
| 감정(nuanceScore) | ±20 | `statusMult × intensity × 4` (pos +1 / neu 0 / warn −1), 일간과 동일 |

- `mentionedDays` = 기간 내 그 종목이 등장한 **리포트 날짜 수** (중복 날짜 제외)
- `totalMentions` = 기간 내 **모든 날·모든 방송의 언급 수 합** (`stock.shows.length` 누적)
- `volumeCap = periodDays × 3` (≈ 하루 방송 4개 중 3개꼴로 매일 등장하면 만점)

```
baseScore = consistencyScore + volumeScore           // 0~90
sortScore = baseScore + nuanceScore                  // -20 ~ 110, 정렬·점수 기준
displayScore = clamp(round(sortScore), 0, 100)       // 화면 0~100
```

### 정렬 우선순위 (주간·월간)
1. sortScore (감정 포함)
2. mentionedDays (꾸준함)
3. totalMentions (누적)
4. intensity

## 일간 공식 (변경 없음, 참고)

`mentionScore(=latestShows×25, max100) + tagScore(max20) + continuityScore(max15) + nuance(±20)`,
display = `clamp(round(rawScore/155×100),0,100)`.

## 구현 메모

- `src/lib/stockRanking.ts`의 `computeScored()`에서 period 분기.
  - day: 기존 공식 유지.
  - week/month: 위 새 공식. `totalMentions`는 집계 루프에서 `stock.shows.length` 누적해 계산.
- 7일 트레일·move 화살표는 `computeScored(d)`를 그대로 재사용하므로 자동 반영.
- 감정(nuance)은 서버에서 `reps[0].sentiment`(일간 캐시) 기반 초기 정렬 → 클라이언트가
  주간/월간 sentiment(`week_sentiment`/`month_sentiment`)로 재정렬하는 현 구조 유지.
- 한국 단일 종목 필터(`isExcludedStock`)는 그대로 적용됨.

## 예상 효과

- LIG넥스원(월간 1일 등장): 꾸준함 1/22 ≈ 3점 → 월간 하위로 이동.
- SK하이닉스(월간 ~20일 등장): 꾸준함 20/22 ≈ 55점 + 누적·감정 → 월간 상위 유지.
