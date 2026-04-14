const fs = require('fs');
const path = require('path');

console.log('🔧 Running post-install fixes...');

// Fix the std::format issue in graphicsConversions.h
const graphicsPath = path.join(__dirname, '../node_modules/react-native/ReactCommon/react/renderer/core/graphicsConversions.h');

console.log('📍 Looking for graphicsConversions.h at:', graphicsPath);

if (fs.existsSync(graphicsPath)) {
  console.log('✓ Found graphicsConversions.h');
  let content = fs.readFileSync(graphicsPath, 'utf8');
  
  // Replace std::format with std::to_string with (int) cast
  if (content.includes('std::format("{}%"')) {
    console.log('⚠ Found std::format issue, fixing...');
    content = content.replace(
      'return std::format("{}%", dimension.value);',
      'return std::to_string((int)dimension.value) + "%";'
    );
    
    // Add sstream include if not present
    if (!content.includes('#include <sstream>')) {
      console.log('⚠ Adding #include <sstream>');
      content = content.replace(
        '#include <array>',
        '#include <array>\n#include <sstream>'
      );
    }
    
    fs.writeFileSync(graphicsPath, content, 'utf8');
    console.log('✅ Fixed std::format issue in graphicsConversions.h');
  } else {
    console.log('✓ std::format issue already fixed or not present');
  }
} else {
  console.log('⚠ graphicsConversions.h not found at expected location');
  console.log('  This is normal for EAS builds - the fix will be applied during build');
}

console.log('✅ Post-install fixes complete');


