import fs from "fs";

const app = fs.readFileSync("src/App.tsx", "utf8").split("\n");

function lines(a, b) {
  return app.slice(a - 1, b).join("\n");
}

// State: file … mobileSidebarOpen + settings + refs (App L114–162), skip history (L124–125 in 1-based = history state)
const stateBlock = app.slice(113, 162).filter((line) => !line.includes("[history, setHistory]"));

const tail = app.slice(200, 719).join("\n");

// Move handleAIAnalysis (sync fn) before renderPDFPage: extract block L335–393, remove from tail by slicing
// App 1-based: handleAIAnalysis 535-593 in current file? grep needed

const aiStart = app.findIndex((l) => l.includes("const handleAIAnalysis = async"));
const aiEnd = app.findIndex((l, i) => i > aiStart && l.trim() === "};" && app[i - 1]?.includes("setIsAnalyzing(false)"));
// fragile — use explicit line search
let aiBlock = "";
for (let i = 0; i < app.length; i++) {
  if (app[i].includes("const handleAIAnalysis = async")) {
    let j = i;
    while (j < app.length && !(j > i && app[j].trim() === "};" && app[j - 1].includes("finally"))) j++;
    // find closing }; of function after finally block
    j = i;
    let depth = 0;
    let started = false;
    for (; j < app.length; j++) {
      if (app[j].includes("const handleAIAnalysis = async")) started = true;
      if (started) {
        if (app[j].includes("{")) depth += (app[j].match(/{/g) || []).length;
        if (app[j].includes("}")) depth -= (app[j].match(/}/g) || []).length;
        if (started && app[j].trim() === "};" && depth <= 0 && j > i + 5) {
          aiBlock = app.slice(i, j + 1).join("\n");
          break;
        }
      }
    }
    break;
  }
}

if (!aiBlock) {
  console.error("Could not find handleAIAnalysis");
  process.exit(1);
}

const renderStart = app.findIndex((l) => l.includes("const renderPDFPage = useCallback"));
const renderEnd = app.findIndex((l, i) => i > renderStart && l.trim() === "}, []);" && app[i - 1].includes("return 0"));
const renderBlock = app.slice(renderStart, renderEnd + 1).join("\n");

const withoutAiAndRender = tail
  .split("\n")
  .filter((_, idx, arr) => {
    const globalIdx = 200 + idx;
    return true;
  });

// Simpler: output pieces for manual merge
fs.writeFileSync("src/features/print-workspace/_generated_state.txt", stateBlock.join("\n"));
fs.writeFileSync("src/features/print-workspace/_generated_ai.txt", aiBlock);
console.log("written _generated_state.txt and _generated_ai.txt");
