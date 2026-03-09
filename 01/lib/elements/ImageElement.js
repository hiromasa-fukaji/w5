class ImageElement extends BaseElement {
  constructor(x, y, img, name = "", tag = "") {
    super(x, y, name, tag);
    this.img = img;
    this.width = img.width;
    this.height = img.height;
    this.tintColor = '#ffffff';
  }

  display(target = window) {
    // visible が false でない場合のみ要素本体を描画
    if (this.visible !== false) {
      target.push();
      target.translate(this.x, this.y);
      target.rotate(this.angle);
      target.scale(this.scale);
      
      // 不透明度付きで描画
      const [r, g, b] = this._getRGBFromHex(this.tintColor);
      const alpha = Math.max(0, Math.min(1, this.opacity)) * 255;
      target.tint(r, g, b, alpha);
      target.imageMode(CENTER);
      target.image(this.img, 0, 0);
      
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

  clone() {
    const cloned = new ImageElement(this.x, this.y, this.img, this.name, this.tag);
    cloned.angle = this.angle;
    cloned.scale = this.scale;
    cloned.tintColor = this.tintColor;
    cloned.opacity = this.opacity;
    cloned.visible = this.visible;
    return cloned;
  }
}
