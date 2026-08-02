# Sonar

## 구현 현황

| Work package | 상태 |
|---|---|
| WP0 - Data contract 및 audit | **구현 완료** - `sonar audit` |
| WP1 - Legacy commonality parity | 미착수 |
| WP2 - Vt별 ET shot prediction | 미착수 |
| WP3 - INLINE imputation, CD distribution | 미착수 |
| WP4 - Chip yield/category model | 미착수 |
| WP5 - Interaction/Commonality engine | 미착수 |
| WP6 - Performance fitting, GPT-OSS RCA | 미착수 |

```bash
pip install -e ".[dev]"
```

```bash
sonar audit --product PRODA
```

실행 방법, 8개 check의 의미, gate 판정 기준, 현재 로컬 샘플에서 나온 결과는
[`docs/WP0_AUDIT.md`](docs/WP0_AUDIT.md)에 있다.

현재 로컬 샘플 기준 `PRODA`/`PRODB` 모두 WP0 gate **FAIL**이며, 원인은 코드가 아니라 데이터
계약이다: 수율 label 부재, 세 원천 간 wafer key 불일치, 버전 없는 좌표 reference.

## v1.2 extension

- [`docs/MAP_SIMILARITY_SECURITY_EXTENSION.md`](docs/MAP_SIMILARITY_SECURITY_EXTENSION.md): wafer-map evidence, leakage-safe clocks, secure product control, causal process graph
- [`docs/CAUSAL_PROCESS_GRAPH.md`](docs/CAUSAL_PROCESS_GRAPH.md): later-step leakage block, same-stage common cause, long-range incoming path design
- [`configs/products/product_2nm.example.yaml`](configs/products/product_2nm.example.yaml): non-sensitive product profile template
- [`knowledge/products/product_2nm.example.md`](knowledge/products/product_2nm.example.md): product knowledge overlay template

Sonar는 Valve의 제품별 wide form을 baseline으로 유지하면서 `Valve`, `flow`, `auto report`의
long-form 공정·ET·INLINE·VM·geometry 정보를 결합하는 반도체 예측 및 commonality/RCA 모델 계획이다.

현재 단계는 **구현 전 architecture와 data contract 확정**이다.

## 문서

- [`PLAN.md`](PLAN.md): 목표, 단계, 평가 기준, POC 범위
- [`docs/WP0_AUDIT.md`](docs/WP0_AUDIT.md): `sonar audit` 실행법, check별 의미, gate 기준,
  현재 데이터에서 확인된 blocker
- [`docs/DATA_SOURCE_INVENTORY.md`](docs/DATA_SOURCE_INVENTORY.md): 실제 세 폴더의 schema,
  canonical mapping, 조인, lineage, 누수 방지 규칙
- [`docs/DETAILED_DESIGN.md`](docs/DETAILED_DESIGN.md): ET·성능·chip 불량·commonality task 설계
- [`docs/SPATIAL_COMPUTE_PLAN.md`](docs/SPATIAL_COMPUTE_PLAN.md): shot/local/chip/TEG 공간 표현과
  CPU/A100 실행 profile
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 전체 모델, expert/MoE, physics, GPT-OSS,
  설명과 성능-수율 최적화

## 권장 첫 실행 순서

1. pilot 제품과 prediction clock을 하나 고정한다.
2. WP0 data audit으로 실제 label join, 좌표 join, schema drift, time leakage를 수치화한다.
3. 동일 split에서 wide baseline과 long-form/spatial baseline을 비교한다.
4. INLINE 보간과 ET multi-fidelity가 masked reconstruction과 downstream target을 모두 개선하는지
   확인한다.
5. tree expert stack을 CPU production candidate로 만들고, 데이터 규모와 incremental gain이
   확인될 때만 A100 Airflow에서 sparse neural MoE를 시험한다.
