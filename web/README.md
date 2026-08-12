# Sonar Alpha Workbench

Sonar는 **localhost 실행을 기본**으로 하는 독립형 웹 앱입니다. FAB·INLINE·ET·VM·Yield·DVC 데이터를 로컬 폴더 또는 S3에서 가져와 위치/구조 정보를 보존한 채 정리하고 wafer-map 유사성 및 Stage-2 surrogate simulation을 실험합니다. Valve나 Flow와 같은 실행 환경일 필요가 없으며, 연결 지점은 파일·S3 manifest와 geometry package입니다.

## Alpha에서 확인할 수 있는 것

- Data intake: FAB/INLINE/ET/VM/Yield/DVC 원천의 S3 URI, grain, join key, schema version 등록
- File explorer: 로컬 폴더와 S3 prefix를 탐색하고 DB·설정·manifest·데이터 파일을 local staging으로 가져오기
- Domain registry: Kelvin, chain, leakage index, OCD anchor 같은 구조 지식과 TEG 위치를 승인 가능한 레지스트리로 관리
- GPT-OSS 120B assistant: 컬럼 의미, 단위, anchor item, join 규칙을 대화로 정리하고 초안을 레지스트리에 반영
- Map lab: ET latent/yield/DVC wafer map의 shape descriptor와 유사 map 후보 확인
- Surrogate lab: Top CD, OCD, 공정 knob 변화에 대한 예측 영향과 학습 support 범위 확인
- D1 workspace 저장 및 R2의 소형 manifest/data dictionary 업로드

현재 map과 surrogate 결과는 UX 검증을 위한 합성 예시입니다. 실제 모델 학습 전에는 의사결정 근거로 사용하면 안 됩니다.

## 데이터 구조 원칙

TEG 위치와 값을 wafer-wide 열로 무한 확장하지 않습니다.

1. 원천은 `lot/wafer/shot/chip/teg/item/x/y/value` 형태의 long-form point store로 보존합니다.
2. 학습 입력은 wafer/shot/chip별 통계, 공간 descriptor, 구조별 embedding(기본 24차원)으로 압축합니다.
3. 설명용으로는 구조·공정 group마다 top-K(기본 18개) feature를 별도 노출합니다.
4. 모델 중요도는 전체 열에 한 번에 배분하지 않고 source → structure → feature의 계층형으로 합산합니다.

권장 target grain은 Yield=`chip`, DVC performance=`chip` 우선이며, 실제 수집 grain이 shot/wafer이면 별도 head로 유지합니다. 서로 다른 grain을 단순 복제해 섞지 않습니다.

## 로컬 실행

필수 환경은 Node.js 22.13 이상입니다.

```powershell
Copy-Item .env.example .env.local
npm install
npm run local
```

`npm run local`은 웹 화면과 로컬 파일/S3 sidecar를 함께 실행합니다. 표시된 `http://localhost:...` 주소를 엽니다. `npm run dev`만 실행하면 화면은 열리지만 File explorer의 로컬/S3 기능은 동작하지 않습니다.

`.env.local`에서 다음 경로를 실제 환경에 맞게 바꿉니다.

```dotenv
SONAR_LOCAL_ROOT=D:\semi-data
SONAR_IMPORT_ROOT=D:\semi-data\sonar-imports
SONAR_FILE_PORT=4711
NEXT_PUBLIC_SONAR_FILE_API=http://127.0.0.1:4711
```

sidecar는 외부 네트워크에 공개되지 않도록 `127.0.0.1`에만 bind합니다. Local explorer는 `SONAR_LOCAL_ROOT` 밖으로 이동할 수 없으며, 가져온 파일은 `SONAR_IMPORT_ROOT`에 별도 사본으로 저장됩니다.

빌드 검증은 다음과 같습니다.

```powershell
npm run build
```

## GPT-OSS 120B 연결

`.env.local`에 사내 OpenAI-compatible endpoint를 입력합니다.

```dotenv
GPT_OSS_ENDPOINT=https://internal-gpt.example.com/v1
GPT_OSS_MODEL=gpt-oss-120b
GPT_OSS_TOKEN=replace-me
GPT_OSS_AUTH_HEADER=Authorization
GPT_OSS_AUTH_SCHEME=Bearer
GPT_OSS_EXTRA_HEADERS_JSON={}
```

endpoint에 `/v1` 또는 `/chat/completions`가 포함되어도 앱이 정규화합니다. 사내 gateway가 `x-api-key`를 쓰면 `GPT_OSS_AUTH_HEADER=x-api-key`, `GPT_OSS_AUTH_SCHEME=`로 설정합니다.

GPT는 원천 row 전체가 아니라 schema·통계·sample·현재 승인 지식만 받습니다. 답변은 `answer`, `assumptions`, `questions`, 선택적 `proposedAnchor` JSON으로 제한하며, anchor 초안은 사람이 승인해야 정식 지식이 됩니다. 배포 환경에서 사내 endpoint에 네트워크로 접근할 수 없다면 fallback assistant가 화면 흐름만 제공합니다.

## S3 입력 계약

대용량 원본은 브라우저로 업로드하지 않고 S3 URI만 등록합니다. 작은 manifest와 data dictionary만 R2 업로드를 지원합니다.

File explorer에서 S3를 직접 탐색하려면 `.env.local`에 bucket과 AWS profile을 설정합니다. 자격증명은 브라우저로 전달되지 않고 로컬 sidecar의 표준 AWS credential chain에서만 읽습니다.

```dotenv
SONAR_S3_BUCKET=fab-curated
SONAR_S3_PREFIX=sonar
AWS_REGION=ap-northeast-2
AWS_PROFILE=your-profile
```

사내 S3-compatible endpoint라면 `SONAR_S3_ENDPOINT`와 `SONAR_S3_FORCE_PATH_STYLE=true`를 추가할 수 있습니다.

필수 manifest 필드 예:

```json
{
  "source": "ET",
  "datasetVersion": "et-2026-08-01-v1",
  "uri": "s3://fab-curated/et/date=2026-08-01/",
  "grain": "teg-point",
  "joinKeys": ["lot_id", "wafer_id", "shot_id", "teg_id", "item_id"],
  "coordinateSystem": "wafer_xy_mm + shot_local_xy_um",
  "schemaUri": "s3://fab-contracts/et/v1/schema.json"
}
```

Flow는 필수 runtime이 아닙니다. 사용하는 경우 `geometry package`만 S3에 내보내면 됩니다. Valve는 FAB 공급원으로 등록하고, Sonar는 자체 주기로 manifest를 읽도록 분리합니다.

## Alpha 사용 순서

1. `npm run local`로 Sonar를 실행합니다.
2. **File explorer**에서 Local 또는 S3를 선택하고 DB·설정·manifest를 local staging으로 가져옵니다.
3. **Data intake**에서 각 원천의 URI와 grain을 source contract로 등록합니다.
4. 우측 assistant에게 “ET full-shot Kelvin과 chain item의 join key와 단위를 정리해줘”처럼 요청합니다.
5. 생성된 anchor 초안을 검토하고 **초안 적용**으로 Domain registry에 넣습니다.
6. **Domain registry**에서 위치·구조·단위·근거를 확인해 승인합니다.
7. **Map lab**과 **Surrogate lab**에서 유사 map과 knob 영향 가설을 확인합니다.
8. 상단 **Save workspace**로 source/asset/anchor/relation/chat 상태를 저장합니다.

## POC 학습 경로

- 1단계: LightGBM baseline — 계층형 aggregate, spatial descriptor, latent feature를 사용하고 wafer/lot group split으로 누출 방지
- 2단계: structure-aware experts — 데이터가 충분한 Kelvin/chain/leakage/OCD group에만 expert를 두고 gate를 제한
- 3단계: data-driven surrogate — 관측 support 안에서만 knob/CD 변화의 target delta와 불확실성을 예측

MoE는 처음부터 필수는 아닙니다. Alpha는 LightGBM baseline과 group ablation으로 “어느 구조 정보가 성능에 영향을 주는가”를 먼저 측정하도록 설계되어 있습니다.

## 주요 경로

- `app/page.tsx`: 제품 UI
- `app/api/chat/route.ts`: GPT-OSS proxy와 안전한 fallback
- `app/api/workspace/route.ts`: D1 workspace 상태
- `app/api/upload/route.ts`: R2 소형 파일 업로드
- `scripts/local-sidecar.mjs`: localhost 전용 로컬 파일/S3 탐색·가져오기 서비스
- `db/schema.ts`: D1 schema
- `lib/demo.ts`: alpha demo state
