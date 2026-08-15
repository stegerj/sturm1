import JSZip from 'jszip';

// Load source and config files as raw text using Vite's eager glob import
const srcFiles = import.meta.glob(
  ['/src/**/*', '/index.html', '/package.json', '/vite.config.ts', '/tsconfig.json', '/tailwind.config.js', '/postcss.config.js', '/capacitor.config.ts', '/README.md'],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

export async function downloadProjectZip(projectName = 'storm-alert-project') {
  const zip = new JSZip();

  // Add all dynamically globbed source files
  for (const [filePath, content] of Object.entries(srcFiles)) {
    if (typeof content === 'string') {
      // Remove leading slash if present
      const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      zip.file(cleanPath, content);
    }
  }

  // Add standard .gitignore
  const gitignoreContent = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`;
  zip.file('.gitignore', gitignoreContent);

  // Add instructions for pushing to GitHub
  const githubInstructions = `# How to push this project to GitHub

1. Create a new repository on https://github.com/new
2. Open terminal in this unzipped folder:
\`\`\`bash
git init
git add .
git commit -m "Initial commit from AI Studio"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
\`\`\`

3. Run locally:
\`\`\`bash
npm install
npm run dev
\`\`\`
`;
  zip.file('GITHUB_PUSH_INSTRUCTIONS.md', githubInstructions);

  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: 'blob' });

  // Trigger download in browser
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${projectName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
