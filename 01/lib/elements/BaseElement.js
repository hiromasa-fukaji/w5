class BaseElement {
  constructor(x, y, name = "", tag = "") {
    this.x = x;
    this.y = y;
    this.name = name;
    this.tag = tag;
    this.angle = 0;
    this.scale = 1;
    this.isSelected = false;
    this.startX = 0;
    this.startY = 0;
    
    // ★変更検知用のバージョン番号
    this.version = 0;
    // 共通の不透明度（0.0〜1.0）
    this.opacity = 1;
  }

  display() {
    // 継承クラスでオーバーライド
    if (this.isSelected) {
      this.drawSelectionBox();
    }
  }

  contains(mx, my) {
    // 当たり判定用（とりあえずfalseを返す）
    return false;
  }

  getWidth() {
    // 子クラスでオーバーライドして実際の幅を返す
    return 100;
  }

  getHeight() {
    // 子クラスでオーバーライドして実際の高さを返す
    return 100;
  }

  getScaleHandlePositions() {
    // 四隅の拡大縮小ハンドルの位置（要素のローカル座標系）
    const w = this.getWidth() * this.scale;
    const h = this.getHeight() * this.scale;
    const halfW = w / 2;
    const halfH = h / 2;
    
    const corners = [
      { x: -halfW, y: -halfH }, // 左上
      { x: halfW, y: -halfH },  // 右上
      { x: halfW, y: halfH },   // 右下
      { x: -halfW, y: halfH }   // 左下
    ];
    
    // 世界座標系に変換
    const cosA = cos(this.angle);
    const sinA = sin(this.angle);
    return corners.map(corner => ({
      x: this.x + corner.x * cosA - corner.y * sinA,
      y: this.y + corner.x * sinA + corner.y * cosA
    }));
  }

  getRotateHandlePosition() {
    // 回転ハンドルの位置（要素のローカル座標系での上部中央の上）
    const w = this.getWidth() * this.scale;
    const h = this.getHeight() * this.scale;
    const handleDistance = 30; // 上部からハンドルまでの距離
    const localX = 0;
    const localY = -h / 2 - handleDistance;
    
    // 世界座標系に変換
    const cosA = cos(this.angle);
    const sinA = sin(this.angle);
    const worldX = this.x + localX * cosA - localY * sinA;
    const worldY = this.y + localX * sinA + localY * cosA;
    
    return { x: worldX, y: worldY };
  }

  isScaleHandleHit(mx, my) {
    const handles = this.getScaleHandlePositions();
    const handleSize = 8;
    for (let handle of handles) {
      const dist = sqrt((mx - handle.x) ** 2 + (my - handle.y) ** 2);
      if (dist <= handleSize) {
        return true;
      }
    }
    return false;
  }

  isRotateHandleHit(mx, my) {
    const handle = this.getRotateHandlePosition();
    const handleRadius = 8;
    const dist = sqrt((mx - handle.x) ** 2 + (my - handle.y) ** 2);
    return dist <= handleRadius;
  }

  drawSelectionBox() {
    push();
    translate(this.x, this.y);
    rotate(this.angle);
    
    const w = this.getWidth() * this.scale;
    const h = this.getHeight() * this.scale;
    const halfW = w / 2;
    const halfH = h / 2;
    
    // 選択ボックスの枠線
    noFill();
    stroke(0, 0, 255);
    strokeWeight(1);
    rectMode(CENTER);
    rect(0, 0, w, h);
    
    // 四隅の拡大縮小ハンドル（青い四角形）
    fill(0, 0, 255);
    noStroke();
    rectMode(CENTER);
    const handleSize = 8;
    rect(-halfW, -halfH, handleSize, handleSize); // 左上
    rect(halfW, -halfH, handleSize, handleSize);  // 右上
    rect(halfW, halfH, handleSize, handleSize);   // 右下
    rect(-halfW, halfH, handleSize, handleSize);  // 左下
    
    pop();
    
    // 回転ハンドル（上部中央の上の青い円）
    const rotateHandle = this.getRotateHandlePosition();
    push();
    translate(this.x, this.y);
    rotate(this.angle);
    
    // 上部中央から回転ハンドルまでの線
    stroke(0, 0, 255);
    strokeWeight(1);
    line(0, -halfH, 0, -halfH - 30);
    
    pop();
    
    // 回転ハンドルの円
    fill(0, 0, 255);
    noStroke();
    circle(rotateHandle.x, rotateHandle.y, 16);
  }

  // HEXカラー（#rrggbb / #rgb）から [r, g, b] を取得するユーティリティ
  _getRGBFromHex(hexColor) {
    if (!hexColor || typeof hexColor !== 'string') {
      return [255, 255, 255];
    }
    let hex = hexColor.trim();
    if (hex[0] === '#') {
      hex = hex.slice(1);
    }
    if (hex.length === 3) {
      hex = hex.split('').map(ch => ch + ch).join('');
    }
    if (hex.length !== 6) {
      return [255, 255, 255];
    }
    const num = parseInt(hex, 16);
    if (Number.isNaN(num)) {
      return [255, 255, 255];
    }
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return [r, g, b];
  }
}
