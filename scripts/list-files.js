const fs = require('fs');
const path = require('path');
const dir = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos';
for (const f of fs.readdirSync(dir)) {
  if (!f.startsWith('~') && !f.startsWith('_')) {
    const full = path.join(dir, f);
    const s = fs.statSync(full);
    console.log(s.size, f);
  }
}
