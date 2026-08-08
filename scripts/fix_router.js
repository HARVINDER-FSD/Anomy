const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '../src/components'));
let modifiedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('const router = useRouter();') || content.includes('const router = useRouter<any>();')) {
    // Add the import if not there
    if (!content.includes('useSafeRouter')) {
      // Find the last import statement to insert after it
      const importRegex = /^import\s+.*$/gm;
      let match;
      let lastImportIndex = 0;
      while ((match = importRegex.exec(content)) !== null) {
        lastImportIndex = match.index + match[0].length;
      }
      
      const importStmt = "\nimport { useSafeRouter } from '@/src/hooks/useSafeRouter';\n";
      if (lastImportIndex === 0) {
        content = importStmt + content;
      } else {
        content = content.slice(0, lastImportIndex) + importStmt + content.slice(lastImportIndex);
      }
    }
    
    content = content.replace(/const router = useRouter\(\);/g, 'const router = useSafeRouter();');
    content = content.replace(/const router = useRouter<any>\(\);/g, 'const router = useSafeRouter();');
    
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
  }
});

console.log(`Modified ${modifiedCount} files in src/components.`);
