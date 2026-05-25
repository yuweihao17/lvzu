const fs = require("fs")

const md = fs.readFileSync("吕祖灵签全集.md", "utf8")

function toChineseNumber(num) {
  const chars = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
  if (num === 100) return "一百"
  if (num <= 10) return chars[num]
  if (num < 20) return "十" + (num % 10 ? chars[num % 10] : "")
  const tens = Math.floor(num / 10)
  const ones = num % 10
  return chars[tens] + "十" + (ones ? chars[ones] : "")
}

function getSection(block, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = block.match(new RegExp("## " + escaped + "\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |\\r?\\n---|$)"))
  return match ? match[1].trim() : ""
}

const headingRe = /^# 吕祖灵签第(.+?)签：(.*)$/gm
const headings = []
let match

while ((match = headingRe.exec(md))) {
  headings.push({
    chinese: match[1],
    story: match[2].trim(),
    index: match.index
  })
}

const signs = headings.map((heading, index) => {
  const id = index + 1
  const end = headings[index + 1] ? headings[index + 1].index : md.length
  const block = md.slice(heading.index, end)
  const oracleMatch = block.match(/^>\s*(.+)$/m)
  const explain = getSection(block, "吕祖灵签第" + heading.chinese + "签：解签")
  const poemText = getSection(block, "吕祖灵签第" + heading.chinese + "签：诗曰")
  const poemExplain = getSection(block, "吕祖灵签第" + heading.chinese + "签：解诗")
  const categoriesText = getSection(block, "吕祖灵签第" + heading.chinese + "签：解曰")
  const categories = []

  categoriesText.replace(/- \*\*([^*]+)\*\*\s*：([^\r\n]*)/g, (_, name, text) => {
    categories.push({
      name: name.trim(),
      text: text.trim()
    })
  })

  return {
    id,
    title: "第" + toChineseNumber(id) + "签",
    grade: id <= 20 ? "上" : id <= 70 ? "中" : "下",
    story: heading.story,
    oracle: oracleMatch ? oracleMatch[1].trim() : "",
    explain,
    poem: poemText.split(/\r?\n+/).map(item => item.trim()).filter(Boolean),
    poemExplain,
    categories
  }
})

fs.mkdirSync("src/common", { recursive: true })
fs.writeFileSync("src/common/signs.js", "export const signs = " + JSON.stringify(signs, null, 2) + "\n", "utf8")
console.log("wrote signs:", signs.length)
