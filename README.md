# movie-making-factory

HyperFrames 기반 영상 렌더링 저장소입니다.

## 현우의 태몽

`content/story.json`을 기준으로 1080x1920 세로형 동화 릴스를 생성합니다.

파이프라인:

1. Nextcloud `/현우/현우의 태몽` 폴더에서 이미지 동기화
2. OpenAI `gpt-4o-mini-tts` + `marin`으로 장면별 한국어 TTS 생성
3. 실제 TTS 길이를 `ffprobe`로 측정
4. 자막 타이밍 + 1.6초 장면 오버랩을 계산해 HyperFrames composition 생성
5. HyperFrames `lint` / `check`
6. 1080x1920 / 30fps / high quality MP4 렌더
7. `hyeonu-taemong-<run number>` 태그로 GitHub Release 생성하고 MP4 첨부

단순 컷 대신 slow zoom, pan, crop, bite impact shake, moon bloom, warm dissolve, white flash, golden aura/particle, ending multi-stage camera move를 사용합니다. 전환 효과에는 0.4초 hold를 두어 빛과 디졸브가 바로 끊기지 않도록 했습니다.

## GitHub Actions secrets

Repository Settings > Secrets and variables > Actions에 다음을 추가하세요.

- `OPENAI_API_KEY`
- `NEXTCLOUD_BASE_URL` (예: `https://cloud.example.com`)
- `NEXTCLOUD_USERNAME`
- `NEXTCLOUD_APP_PASSWORD`

이미지를 저장소에 직접 넣을 경우 `assets/hyeonu-taemong/` 아래에 `cover.png`, `1.png` ~ `8.png`, `ending.png`을 두면 Nextcloud secrets 없이도 동작합니다.

## 실행

Actions에서 `Render Hyeonu Taemong` workflow를 수동 실행합니다.

완료되면 Actions artifact 대신 repository Releases에서 `hyeonu-taemong.mp4`를 받을 수 있습니다.

HyperFrames CLI는 Node.js 22+와 FFmpeg를 사용하며 이 저장소는 `hyperframes@0.8.50`으로 고정했습니다.
