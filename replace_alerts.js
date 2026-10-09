const fs = require('fs');
const path = require('path');

const files = [
  'app/(tabs)/dashboard.tsx',
  'app/index.tsx',
  'app/screens/live-map.tsx',
  'app/screens/map.tsx',
  'app/screens/trip-details.tsx',
  'app/screens/trips.tsx'
];

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  if (content.includes('Alert.alert(')) {
    content = content.replace(/Alert\.alert\(/g, 'showCustomAlert(');
    
    // add import
    const importStatement = "import { showCustomAlert } from '@/components/GlobalAlert';\n";
    if (!content.includes('showCustomAlert } from')) {
      // insert after first import
      const firstImportIndex = content.indexOf('import');
      if (firstImportIndex !== -1) {
        content = content.slice(0, firstImportIndex) + importStatement + content.slice(firstImportIndex);
      } else {
        content = importStatement + content;
      }
    }
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
