const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const screenshotDesktop = require('screenshot-desktop');
const sharp = require('sharp');

let mainWindow;
let selectionWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

async function createSelectionWindow(aspect, initW, initH) {
  try {
    console.log('Capturing full screenshot with screenshot-desktop...');
    // 自身のウィンドウを隠して全画面キャプチャに含めない
    if (mainWindow) { mainWindow.hide(); }
    const imgBuffer = await screenshotDesktop();
    console.log('Full screenshot captured, buffer size:', imgBuffer.length);

    if (imgBuffer.length === 0) {
      console.log('screenshot-desktop returned empty buffer, trying with timeout...');
      await new Promise(r => setTimeout(r, 500));
      const imgBuffer2 = await screenshotDesktop();
      console.log('Second attempt buffer size:', imgBuffer2.length);
      if (imgBuffer2.length > 0) {
        const selectionScreenshotPath = path.join(app.getPath('temp'), `selection_bg_${Date.now()}.png`);
        await fs.writeFile(selectionScreenshotPath, imgBuffer2);
        console.log('BG saved, exists:', await fs.pathExists(selectionScreenshotPath));
        selectionWindow = new BrowserWindow({
          fullscreen: true,
          frame: false,
          backgroundColor: '#000',
          alwaysOnTop: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
          },
          icon: path.join(__dirname, 'icon.png')
        });
        const selectionHtmlPath = path.join(__dirname, 'selection.html');
        const url = `file://${selectionHtmlPath}?bgPath=${encodeURIComponent(selectionScreenshotPath)}&aspect=${aspect}&initW=${initW}&initH=${initH}`;
        console.log('Loading selection with bgPath');
        selectionWindow.loadURL(url);
        await new Promise((resolve, reject) => {
          const handler = () => {
            selectionWindow.webContents.removeListener('dom-ready', handler);
            const imgBuf = imgBuffer2 || imgBuffer;
            const dataUri = 'data:image/png;base64,' + imgBuf.toString('base64');
            selectionWindow.webContents.send('selection:bg-image', dataUri);
            console.log('Sent bg-image to selection window');
            resolve();
          };
          selectionWindow.webContents.on('dom-ready', handler);
        });
        return;
      }
      throw new Error('Failed to capture full screenshot');
    }

    const selectionScreenshotPath = path.join(app.getPath('temp'), `selection_bg_${Date.now()}.png`);
    await fs.writeFile(selectionScreenshotPath, imgBuffer);
    console.log('BG saved, exists:', await fs.pathExists(selectionScreenshotPath));

    selectionWindow = new BrowserWindow({
      fullscreen: true,
      frame: false,
      backgroundColor: '#000',
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
      icon: path.join(__dirname, 'icon.png')
    });

    const selectionHtmlPath = path.join(__dirname, 'selection.html');
    const url = `file://${selectionHtmlPath}?bgPath=${encodeURIComponent(selectionScreenshotPath)}&aspect=${aspect}&initW=${initW}&initH=${initH}`;
    console.log('Loading selection window');
    selectionWindow.loadURL(url);
    await new Promise((resolve, reject) => {
      const handler = () => {
        selectionWindow.webContents.removeListener('dom-ready', handler);
        const dataUri = 'data:image/png;base64,' + imgBuffer.toString('base64');
        selectionWindow.webContents.send('selection:bg-image', dataUri);
        console.log('Sent bg-image to selection window');
        resolve();
      };
      selectionWindow.webContents.on('dom-ready', handler);
    });
  } catch (error) {
    console.error('Failed to create selection window:', error);
    throw error;
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.handle('dialog:save-dialog', async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: '名前を付けて保存',
      defaultPath: path.join(app.getPath('documents'), 'screenshot.png'),
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
    });
    return filePath;
  });

  ipcMain.handle('copy-file', async (event, { from, to }) => {
    await fs.copy(from, to);
    return true;
  });

  ipcMain.handle('window:open-selection', async (event, aspect, initW, initH) => {
    console.log('Opening selection window');
    await createSelectionWindow(aspect, initW, initH);
    return true;
  });

  ipcMain.on('selection:finished', async (event, rect) => {
    console.log('Selection finished:', rect);
    
    // 選択ウィンドウを先に非表示にして閉じる
    if (selectionWindow) {
      selectionWindow.hide();
      selectionWindow.setFullScreen(false);
      selectionWindow.close();
      selectionWindow = null;
    }

    // メインウィンドウへの通知のみ行う（表示はキャプチャ完了後に行う）
    if (mainWindow) {
      mainWindow.webContents.send('selection:rect-selected', rect);
    }
  });

  ipcMain.on('selection:cancelled', () => {
    console.log('Selection cancelled');
    
    if (selectionWindow) {
      selectionWindow.hide();
      selectionWindow.setFullScreen(false);
      selectionWindow.close();
      selectionWindow = null;
    }

    if (mainWindow) {
      mainWindow.show();
      mainWindow.setFullScreen(false);
    }
  });

  ipcMain.handle('screenshot:capture', async (event, region) => {
    try {
      const { x, y, width, height } = region;
      
      // キャプチャ時に自身のウィンドウが映り込まないように隠す
      // すでに隠れている場合（選択直後）も、OSのウィンドウ遷移待ちとして少し待機する
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.hide();
        await new Promise(r => setTimeout(r, 200));
      } else {
        await new Promise(r => setTimeout(r, 200));
      }

      console.log('Capturing full screen for manual crop:', x, y, width, height);
      let imgBuffer = await screenshotDesktop();
      
      const metadata = await sharp(imgBuffer).metadata();
      console.log('Original screen size:', metadata.width, metadata.height);
      const left = Math.max(0, Math.min(x, metadata.width - 1));
      const top = Math.max(0, Math.min(y, metadata.height - 1));
      const extractWidth = Math.min(width, metadata.width - left);
      const extractHeight = Math.min(height, metadata.height - top);

      if (extractWidth <= 0 || extractHeight <= 0) {
        throw new Error('Invalid capture area');
      }

      imgBuffer = await sharp(imgBuffer)
        .extract({ left, top, width: extractWidth, height: extractHeight })
        .toBuffer();

      const tempPath = path.join(app.getPath('temp'), `snapset_${Date.now()}.png`);
      await fs.writeFile(tempPath, imgBuffer);

      // キャプチャが終わったらメインウィンドウを再表示
      if (mainWindow) {
        mainWindow.show();
        mainWindow.setFullScreen(false);
      }

      return tempPath;
    } catch (error) {
      // エラー時もメインウィンドウを復帰させる
      if (mainWindow) {
        mainWindow.show();
        mainWindow.setFullScreen(false);
      }
      console.error('Screenshot failed:', error);
      throw error;
    }
  });

  ipcMain.handle('process:image', async (event, { inputPath, config }) => {
    try {
      // 1. 基本となる画像を読み込み
      let currentBuffer = await sharp(inputPath).toBuffer();
      
      // 2. 指定サイズにリサイズ
      // 枠（ボーダー）を追加しても最終的なサイズが targetSize になるように、内側のサイズを計算する
      const border = parseInt(config.borderSize) || 0;
      let innerW = config.targetSize.width;
      let innerH = config.targetSize.height;

      if (config.targetSize && config.targetSize.width > 0 && config.targetSize.height > 0) {
        innerW = Math.max(1, config.targetSize.width - border * 2);
        innerH = Math.max(1, config.targetSize.height - border * 2);
        
        currentBuffer = await sharp(currentBuffer)
          .resize(innerW, innerH)
          .toBuffer();
      }

      // 3. 枠（ボーダー）を追加
      // これにより最終的なサイズがちょうど config.targetSize になる
      if (border > 0) {
        const color = config.borderColor || 'black';
        currentBuffer = await sharp(currentBuffer)
          .extend({
            top: border, bottom: border, left: border, right: border,
            background: color
          })
          .toBuffer();
      }

      // 4. 加工した画像上でのリダクション処理（モザイク・塗りつぶし）
      if (config.redactions && config.redactions.length > 0) {
        const metadata = await sharp(currentBuffer).metadata();
        const finalW = metadata.width;
        const finalH = metadata.height;
        console.log(`Processing ${config.redactions.length} redactions on ${finalW}x${finalH} image`);

        const patches = [];
        for (const red of config.redactions) {
          // 範囲が画像内に収まるようにクランプ
          const rx = Math.max(0, Math.min(Math.round(red.x), finalW - 1));
          const ry = Math.max(0, Math.min(Math.round(red.y), finalH - 1));
          const rw = Math.max(1, Math.min(Math.round(red.width), finalW - rx));
          const rh = Math.max(1, Math.min(Math.round(red.height), finalH - ry));

          console.log(`Applying ${red.type}: x=${rx}, y=${ry}, w=${rw}, h=${rh}`);

          if (red.type === 'fill') {
            const fillColor = red.color || '#000000';
            const fillBuffer = await sharp({
              create: {
                width: rw, height: rh, channels: 4,
                background: fillColor
              }
            }).png().toBuffer();
            patches.push({ input: fillBuffer, left: rx, top: ry });
          }
        }

        if (patches.length > 0) {
          currentBuffer = await sharp(currentBuffer).composite(patches).toBuffer();
          console.log('Successfully composited patches');
        }
      }

      const outputPath = inputPath.replace('snapset_', 'snapset_processed_');
      await fs.writeFile(outputPath, currentBuffer);
      return outputPath;
    } catch (error) {
      console.error('Processing failed:', error);
      throw error;
    }
  });

  ipcMain.handle('get:processed-image', async (event, outputPath) => {
    const buffer = await fs.readFile(outputPath);
    const base64 = buffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
