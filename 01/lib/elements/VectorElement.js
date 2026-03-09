class VectorElement extends BaseElement {
  constructor(x, y, svgString, name = "", tag = "") {
    super(x, y, name, tag);
    // ★重要: これがないと、コピーした時に「何の形だっけ？」と記憶喪失になります
    this.svgString = svgString; 
    
    this.color = '#ffffff';
    this.strokeColor = '#000000';
    this.strokeWeight = 1;
    this.width = 100;
    this.height = 100;
    this.contours = [];
    this.centerX = 0;
    this.centerY = 0;
    
    // ★キャッシュ用
    this._cachedPoints = null;
    this._cachedPointsVersion = -1;
    
    // SVGをパースして一時的なパス要素を作る
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const pathElement = doc.querySelector("path"); 

    if (!pathElement) {
      console.error('No path element found in SVG');
      return;
    }

    // DOM要素を作って計算させる
    const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempPath.setAttribute("d", pathElement.getAttribute("d"));
    
    // ★改善ポイント1: サンプリングをより細かく、柔軟に
    const len = tempPath.getTotalLength();
    // 全長に対して十分な数の点を取る（最低でも300点、または1px間隔）
    const totalPoints = Math.max(2000, Math.floor(len)); 
    const step = len / totalPoints; 
    
    this.contours = []; 
    let currentContour = []; 
    
    // バウンディングボックス計算用（サンプリングした点から計算）
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // パスをサンプリング
    let prevP = null;
    for (let i = 0; i <= len; i += step) {
      const p = tempPath.getPointAtLength(Math.min(i, len));
      
      // 最初の点、または大きく飛んだ場合に新しいパス（穴など）を開始
      if (prevP !== null) {
        const dist = Math.sqrt((p.x - prevP.x)**2 + (p.y - prevP.y)**2);
        // stepの5倍以上離れていたら別の輪郭（穴など）とみなす
        if (dist > step * 5) { 
          if (currentContour.length > 0) {
            this.contours.push(currentContour);
          }
          currentContour = [];
        }
      }
      
      currentContour.push({ x: p.x, y: p.y });
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      prevP = p;
    }
    
    if (currentContour.length > 0) {
      this.contours.push(currentContour);
    }
    
    // ★改善ポイント2: サンプリングした点からバウンディングボックスを計算
    if (isFinite(minX) && isFinite(maxX)) {
      this.width = maxX - minX || 100;
      this.height = maxY - minY || 100;
      this.centerX = (minX + maxX) / 2;
      this.centerY = (minY + maxY) / 2;
    } else {
      // フォールバック値
      this.width = 100;
      this.height = 100;
      this.centerX = 50;
      this.centerY = 50;
    }
  }

  display(target = window) {
    // visible が false でない場合のみ要素本体を描画
    if (this.visible !== false) {
      target.push();
      target.translate(this.x, this.y);
      target.rotate(this.angle);
      target.scale(this.scale);

      // 不透明度付きで描画
      const [r, g, b] = this._getRGBFromHex(this.color);
      const alpha = Math.max(0, Math.min(1, this.opacity)) * 255;
      target.fill(r, g, b, alpha);
      target.noStroke();

      target.beginShape();
      
      if (this.contours.length > 0) {
        for (let p of this.contours[0]) {
          target.vertex(p.x - this.centerX, p.y - this.centerY);
        }
      }

      for (let i = 1; i < this.contours.length; i++) {
        target.beginContour(); 
        for (let p of this.contours[i]) {
          target.vertex(p.x - this.centerX, p.y - this.centerY);
        }
        target.endContour();
      }

      target.endShape(CLOSE);
      
      target.pop();
    }
    
    // 選択枠はメインキャンバスのみに表示（visible に関わらず表示）
    if (this.isSelected && target === window) {
      this.drawSelectionBox();
    }
  }

  getWidth() {
    return this.width;
  }

  getHeight() {
    return this.height;
  }

  contains(mx, my) {
    // スケールと回転を考慮した当たり判定
    const halfW = this.width * this.scale / 2;
    const halfH = this.height * this.scale / 2;
    
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

  // ★修正: 正規の方法で新品のインスタンスを作る
  clone() {
    // コンストラクタに「保存しておいたSVGデータ」を渡して、完全に同じ新品を作る
    const cloned = new VectorElement(this.x, this.y, this.svgString, this.name, this.tag);
    
    // 変化したプロパティだけ上書きする
    cloned.angle = this.angle;
    cloned.scale = this.scale;
    cloned.color = this.color;
    cloned.opacity = this.opacity;
    cloned.visible = this.visible;
    // contours（点データ）やwidth/heightはコンストラクタで自動生成されるのでコピー不要！
    
    return cloned;
  }

  // ★形状の点リストを取得（SVGの塗りつぶし領域をサンプリング）
  getPoints(step = 5) {
    // キャッシュをチェック（バージョンが変わっていなければキャッシュを返す）
    if (this._cachedPoints !== null && this._cachedPointsVersion === this.version) {
      return this._cachedPoints;
    }
    
    console.log(`VectorElement.getPoints called, step: ${step}`);
    
    try {
      // Canvas APIを使ってSVGの塗りつぶし領域をサンプリング
      // ★高解像度で描画してアンチエイリアスを滑らかにする
      const scale = 4; // 4倍の解像度で描画
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // キャンバスサイズを設定（高解像度）
      const padding = 20;
      const baseWidth = Math.ceil(this.width + padding * 2);
      const baseHeight = Math.ceil(this.height + padding * 2);
      canvas.width = baseWidth * scale;
      canvas.height = baseHeight * scale;
      
      console.log(`Canvas size for SVG: ${canvas.width}x${canvas.height} (scale: ${scale}x)`);
      
      // ★アンチエイリアスを有効化
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // スケールを適用
      ctx.scale(scale, scale);
      
      // 背景を黒で塗りつぶし
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, baseWidth, baseHeight);
      
      // SVGパスを描画
      ctx.fillStyle = 'white';
      ctx.translate(baseWidth / 2, baseHeight / 2);
      
      // 輪郭データを使ってパスを描画
      ctx.beginPath();
      
      if (this.contours.length > 0) {
        // 最初の輪郭（外枠）
        const firstContour = this.contours[0];
        if (firstContour.length > 0) {
          ctx.moveTo(firstContour[0].x - this.centerX, firstContour[0].y - this.centerY);
          for (let i = 1; i < firstContour.length; i++) {
            ctx.lineTo(firstContour[i].x - this.centerX, firstContour[i].y - this.centerY);
          }
          ctx.closePath();
        }
        
        // 残りの輪郭（穴）
        for (let i = 1; i < this.contours.length; i++) {
          const contour = this.contours[i];
          if (contour.length > 0) {
            ctx.moveTo(contour[0].x - this.centerX, contour[0].y - this.centerY);
            for (let j = 1; j < contour.length; j++) {
              ctx.lineTo(contour[j].x - this.centerX, contour[j].y - this.centerY);
            }
            ctx.closePath();
          }
        }
      }
      
      // evenodd ルールで塗りつぶし（中抜き対応）
      ctx.fill('evenodd');
      
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
      
      console.log(`Generated ${points.length} points from SVG shape`);
      
      // ★キャッシュに保存
      this._cachedPoints = points;
      this._cachedPointsVersion = this.version;
      
      return points;
      
    } catch (err) {
      console.error('Error in VectorElement.getPoints:', err);
      // エラー時はフォールバック: 輪郭線だけを返す
      const allPoints = [];
      for (let contour of this.contours) {
        for (let p of contour) {
          allPoints.push({
            x: p.x - this.centerX,
            y: p.y - this.centerY
          });
        }
      }
      this._cachedPoints = allPoints;
      this._cachedPointsVersion = this.version;
      return allPoints;
    }
  }
}