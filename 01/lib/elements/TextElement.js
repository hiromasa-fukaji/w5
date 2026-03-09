class TextElement extends BaseElement {
  constructor(x, y, textString, name = "", tag = "") {
    super(x, y, name, tag);
    this.text = textString;
    this.fontSize = 40;
    this.font = 'Helvetica Neue';
    this.color = '#ffffff';
    
    // ★キャッシュ用
    this._cachedPoints = null;
    this._cachedPointsVersion = -1;
  }

  display(target = window) {
    // visible が false でない場合のみ要素本体を描画
    if (this.visible !== false) {
      target.push();
      target.translate(this.x, this.y);
      target.rotate(this.angle);
      target.scale(this.scale);
      
      target.textFont(this.font);
      target.textSize(this.fontSize);
      // 不透明度付きで描画
      const [r, g, b] = this._getRGBFromHex(this.color);
      const alpha = Math.max(0, Math.min(1, this.opacity)) * 255;
      target.fill(r, g, b, alpha);
      target.textAlign(CENTER, CENTER);
      target.text(this.text, 0, 0);
      
      target.pop();
    }
    
    // 選択枠はメインキャンバスのみに表示（visible に関わらず表示）
    if (this.isSelected && target === window) {
      this.drawSelectionBox();
    }
  }

  getWidth() {
    textFont(this.font);
    textSize(this.fontSize);
    return textWidth(this.text);
  }

  getHeight() {
    return this.fontSize;
  }

  contains(mx, my) {
    // スケールと回転を考慮した当たり判定
    textFont(this.font);
    textSize(this.fontSize);
    const textW = textWidth(this.text) * this.scale;
    const textH = this.fontSize * this.scale;
    const halfW = textW / 2;
    const halfH = textH / 2;
    
    // マウス座標を要素のローカル座標系に変換
    const dx = mx - this.x;
    const dy = my - this.y;
    const cosA = cos(-this.angle);
    const sinA = sin(-this.angle);
    const localX = dx * cosA - dy * sinA;
    const localY = dx * sinA + dy * cosA;
    
    // ローカル座標系での矩形判定
    return (localX >= -halfW && localX <= halfW &&
            localY >= -halfH && localY <= halfH);
  }

  clone() {
    const cloned = new TextElement(this.x, this.y, this.text, this.name, this.tag);
    cloned.angle = this.angle;
    cloned.scale = this.scale;
    cloned.color = this.color;
    cloned.fontSize = this.fontSize;
    cloned.font = this.font;
    cloned.opacity = this.opacity;
    cloned.visible = this.visible;
    return cloned;
  }

  // ★形状の点リストを取得（Canvas API直接使用）
  getPoints(step = 5) {
    // キャッシュをチェック（バージョンが変わっていなければキャッシュを返す）
    if (this._cachedPoints !== null && this._cachedPointsVersion === this.version) {
      console.log(`Using cached points (${this._cachedPoints.length} points)`);
      return this._cachedPoints;
    }
    
    console.log(`getPoints called for text: "${this.text}", fontSize: ${this.fontSize}, step: ${step}`);
    
    try {
      // Canvas APIを直接使って文字を描画
      // ★高解像度で描画してアンチエイリアスを滑らかにする
      const scale = 4; // 4倍の解像度で描画
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // キャンバスサイズを設定（高解像度）
      const padding = this.fontSize;
      const baseWidth = Math.ceil(this.getWidth() + padding * 2);
      const baseHeight = Math.ceil(this.fontSize + padding * 2);
      canvas.width = baseWidth * scale;
      canvas.height = baseHeight * scale;
      
      console.log(`Canvas size: ${canvas.width}x${canvas.height} (scale: ${scale}x)`);
      
      // ★アンチエイリアスを有効化
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // スケールを適用
      ctx.scale(scale, scale);
      
      // 背景を黒で塗りつぶし
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, baseWidth, baseHeight);
      
      // 文字を白で描画（高解像度）
      ctx.fillStyle = 'white';
      ctx.font = `${this.fontSize}px ${this.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.text, baseWidth / 2, baseHeight / 2);
      
      // ピクセルデータを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      const points = [];
      let count = 0;
      const maxPoints = 1000000;
      
      // ピクセルをスキャンして白い部分を抽出
      // ★高解像度なので、stepもスケールに合わせて調整
      const scaledStep = step * scale;
      
      for (let y = 0; y < canvas.height; y += scaledStep) {
        for (let x = 0; x < canvas.width; x += scaledStep) {
          if (count >= maxPoints) break;
          
          const index = (Math.floor(x) + Math.floor(y) * canvas.width) * 4;
          const r = pixels[index];
          
          // ★閾値を下げて中間色（アンチエイリアス部分）も含める
          if (r > 50) { // 128 → 50 に変更（より滑らか）
            // 中心を原点とした座標に変換（元のスケールに戻す）
            points.push({ 
              x: (x - canvas.width / 2) / scale, 
              y: (y - canvas.height / 2) / scale 
            });
            count++;
          }
        }
        if (count >= maxPoints) break;
      }
      
      console.log(`Generated ${points.length} points from text shape`);
      
      // ★キャッシュに保存
      this._cachedPoints = points;
      this._cachedPointsVersion = this.version;
      
      return points;
      
    } catch (err) {
      console.error('Error in getPoints:', err);
      return [];
    }
  }
  
  // ★ピクセルベース版（デバッグ用・現在は使用しない）
  getPointsPixelBased(step = 5) {
    console.log(`getPoints called for text: "${this.text}", fontSize: ${this.fontSize}, step: ${step}`);
    
    try {
      // 文字の概算サイズを計算
      const estimatedW = this.fontSize * this.text.length * 0.6;
      const estimatedH = this.fontSize * 1.2;
      
      // キャンバスサイズを制限
      const w = Math.min(Math.ceil(estimatedW * 2), 1000);
      const h = Math.min(Math.ceil(estimatedH * 2), 1000);
      
      console.log(`Creating graphics buffer: ${w}x${h}`);
      
      // ★改善: window.createGraphics を明示的に呼び出す
      let pg;
      if (typeof window.createGraphics === 'function') {
        pg = window.createGraphics(w, h);
      } else if (typeof createGraphics === 'function') {
        pg = createGraphics(w, h);
      } else {
        console.error('createGraphics is not available');
        return [];
      }
      
      // pgが正しく生成されているか確認
      if (!pg || typeof pg !== 'object') {
        console.error('Failed to create graphics buffer, pg:', pg);
        return [];
      }
      
      console.log('Graphics buffer created:', pg);
      
      // メソッドが存在するか確認しながら実行
      if (pg.pixelDensity && typeof pg.pixelDensity === 'function') {
        pg.pixelDensity(1);
      }
      
      if (!pg.background || typeof pg.background !== 'function') {
        console.error('pg.background is not a function. pg:', pg);
        console.error('pg properties:', Object.keys(pg));
        return [];
      }
      
      pg.background(0);
      pg.fill(255);
      pg.textAlign(CENTER, CENTER);
      pg.textSize(this.fontSize);
      pg.textFont(this.font);
      pg.text(this.text, w / 2, h / 2);

      pg.loadPixels();
      const points = [];
      
      // サンプリング数を制限（最大5000点）
      let count = 0;
      const maxPoints = 5000;
      
      const actualW = pg.width;
      const actualH = pg.height;
      
      console.log(`Scanning pixels: ${actualW}x${actualH}, pixels array length: ${pg.pixels.length}`);
      
      for (let y = 0; y < actualH; y += step) {
        for (let x = 0; x < actualW; x += step) {
          if (count >= maxPoints) break;
          
          const index = (Math.floor(x) + Math.floor(y) * actualW) * 4;
          if (index >= 0 && index < pg.pixels.length && pg.pixels[index] > 128) {
            points.push({ x: x - actualW / 2, y: y - actualH / 2 });
            count++;
          }
        }
        if (count >= maxPoints) break;
      }
      
      if (pg.remove && typeof pg.remove === 'function') {
        pg.remove();
      }
      
      console.log(`Generated ${points.length} points`);
      
      // ★キャッシュに保存
      this._cachedPoints = points;
      this._cachedPointsVersion = this.version;
      
      return points;
      
    } catch (err) {
      console.error('Error in getPoints:', err);
      console.error('Error stack:', err.stack);
      return [];
    }
  }
}
