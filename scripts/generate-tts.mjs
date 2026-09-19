import fs from "node:fs";
import path from "node:path";

const story = JSON.parse(fs.readFileSync("content/story.json", "utf8"));
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required.");

const outDir = path.resolve("audio/scenes");
fs.mkdirSync(outDir, { recursive: true });

const mood = {
  calm: "조용하고 포근하게 시작한다.",
  reveal: "두 뱀의 등장에는 신비로움과 아주 약한 긴장감을 준다.",
  tension: "속도를 조금 늦추고 불안감이 느껴지게 한다.",
  bite: "그리고 갑자기를 짧게 끊고, 콱 물었어요를 분명하게 강조한다.",
  aftermath: "놀란 마음은 남아 있지만 과장하지 않고 차분하게 설명한다.",
  gold: "공포보다 경이로움이 점점 커지는 느낌으로 읽는다.",
  transformation: "마침내에서 여백을 주고, 변신 장면은 신비롭고 웅장하게 읽는다.",
  realization: "바로 현우였다는 것을을 가장 중요한 문장처럼 천천히 읽는다.",
  ending: "가장 따뜻하고 안정적으로 읽고 마지막 문장 뒤에는 긴 여운을 둔다."
};

for (let i = 0; i < story.scenes.length; i += 1) {
  const scene = story.scenes[i];
  if (!scene.narration) continue;
  const filename = String(i).padStart(2, "0") + "-" + scene.id + ".wav";
  const output = path.join(outDir, filename);
  if (fs.existsSync(output) && process.env.FORCE_TTS !== "1") {
    console.log("TTS exists, skipping: " + filename);
    continue;
  }
  console.log("Generating TTS: " + scene.id);
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: story.ttsModel,
      voice: story.voice,
      input: scene.narration,
      instructions: story.narrationInstructions + " " + (mood[scene.mood] || ""),
      response_format: "wav"
    })
  });
  if (!response.ok) throw new Error("OpenAI TTS failed for " + scene.id + ": " + response.status + " " + await response.text());
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(output, buffer);
  console.log("Saved " + output + " (" + buffer.length + " bytes)");
}
