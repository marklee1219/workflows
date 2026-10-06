const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const mode of ['development','production']){
 const target=path.join(root,'builds',mode);
 for(const dir of ['css','js'])fs.mkdirSync(path.join(target,dir),{recursive:true});
 fs.copyFileSync(path.join(root,'components/scripts/experiences.js'),path.join(target,'js/script.js'));
 fs.copyFileSync(path.join(root,'components/sass/style.scss'),path.join(target,'css/style.css'));
 if(mode==='production')fs.copyFileSync(path.join(root,'builds/development/index.html'),path.join(target,'index.html'));
}
console.log('Built Zoe’s tracker for development and production.');
