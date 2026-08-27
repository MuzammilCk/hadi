const fs = require('fs');
const glob = require('glob');
const path = require('path');
const files = glob.sync('src/**/*.controller.ts', { cwd: 'd:/projects/hadi/hadi-perfumes-api' });
files.forEach(file => {
    const content = fs.readFileSync(path.join('d:/projects/hadi/hadi-perfumes-api', file), 'utf8');
    const lines = content.split('\n');
    let controllerRoute = '';
    const endpoints = [];
    lines.forEach(line => {
        const cMatch = line.match(/@Controller\(['\x22]([^'\x22]*)['\x22]\)/);
        if (line.includes('@Controller') && cMatch) controllerRoute = cMatch[1];
        else if (line.includes('@Controller()')) controllerRoute = '';
        
        const mMatch = line.match(/@(Get|Post|Put|Patch|Delete)\(['\x22]([^'\x22]*)['\x22]/);
        if (mMatch) {
            endpoints.push(mMatch[1].toUpperCase() + ' /' + controllerRoute + '/' + mMatch[2]);
        } else {
            const mMatchEmpty = line.match(/@(Get|Post|Put|Patch|Delete)\(\)/);
            if (mMatchEmpty) endpoints.push(mMatchEmpty[1].toUpperCase() + ' /' + controllerRoute);
        }
    });
    console.log(file + ':');
    endpoints.forEach(ep => console.log('  ' + ep.replace(/\/\//g, '/')));
});
