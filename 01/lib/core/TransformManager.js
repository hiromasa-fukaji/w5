class TransformManager {
  constructor() {
    this.isDragging = false;
    this.transformMode = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.initialDistance = 1;
    this.initialAngle = 0;
    this.startMouseX = 0;
    this.startMouseY = 0;
  }

  onPressed(elements, mx, my) {
    // 選択中の要素が1つだけの場合のみ変形ハンドルをチェック
    const selectedElements = elements.filter(el => el.isSelected);
    if (selectedElements.length === 1) {
      const selectedElement = selectedElements[0];
      if (selectedElement.isScaleHandleHit(mx, my)) {
        // 拡大縮小ハンドルがクリックされた
        this.transformMode = 'scale';
        // 初期距離を保存（オブジェクトの中心からの距離）
        const dx = mx - selectedElement.x;
        const dy = my - selectedElement.y;
        this.initialDistance = sqrt(dx * dx + dy * dy);
        this.baseScale = selectedElement.scale;
        return;
      } else if (selectedElement.isRotateHandleHit(mx, my)) {
        // 回転ハンドルがクリックされた
        this.transformMode = 'rotate';
        // 初期角度を保存
        const dx = mx - selectedElement.x;
        const dy = my - selectedElement.y;
        this.initialAngle = atan2(dy, dx);
        this.baseAngle = selectedElement.angle;
        return;
      }
    }

    // 配列を逆順（上にあるものから）ループ
    let clickedElement = null;
    let clickedIndex = -1;
    
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      if (element.contains(mx, my)) {
        clickedElement = element;
        clickedIndex = i;
        break;
      }
    }
    
    if (clickedElement) {
      // 何か要素をクリックした場合
      
      // まず、クリックした要素が既に選択されているかチェック
      const wasAlreadySelected = clickedElement.isSelected;
      
      if (keyIsDown(SHIFT)) {
        // Shiftキーが押されている場合はトグル動作
        clickedElement.isSelected = !clickedElement.isSelected;
      } else {
        // Shiftが押されていない場合
        if (!wasAlreadySelected) {
          // クリックした要素が選択されていなかった場合は、その要素のみ選択
          for (let j = 0; j < elements.length; j++) {
            elements[j].isSelected = (j === clickedIndex);
          }
        }
        // 既に選択されていた場合は、選択状態を変更せずドラッグを開始
      }
      
      // ドラッグ準備：マウス開始位置と選択中の全要素の初期位置を保存
      this.isDragging = true;
      this.startMouseX = mx;
      this.startMouseY = my;
      for (let el of elements) {
        if (el.isSelected) {
          el.startX = el.x;
          el.startY = el.y;
        }
      }
      return;
    }
    
    // どの要素にもヒットしなかった場合
    if (!keyIsDown(SHIFT)) {
      // Shiftが押されていない場合のみ、すべての選択を解除
      for (let element of elements) {
        element.isSelected = false;
      }
    }
  }

  onDragged(elements, mx, my, system) {
    const selectedElements = elements.filter(el => el.isSelected);
    if (selectedElements.length === 0) return;

    if (this.transformMode === 'scale' && selectedElements.length === 1) {
      // 拡大縮小処理（単一選択時のみ）
      const selectedElement = selectedElements[0];
      const dx = mx - selectedElement.x;
      const dy = my - selectedElement.y;
      const currentDistance = sqrt(dx * dx + dy * dy);
      selectedElement.scale = this.baseScale * (currentDistance / this.initialDistance);
    } else if (this.transformMode === 'rotate' && selectedElements.length === 1) {
      // 回転処理（単一選択時のみ）
      const selectedElement = selectedElements[0];
      const dx = mx - selectedElement.x;
      const dy = my - selectedElement.y;
      const currentAngle = atan2(dy, dx);
      selectedElement.angle = this.baseAngle + (currentAngle - this.initialAngle);
    } else if (this.isDragging) {
      // 移動処理（複数選択対応）
      const dx = mx - this.startMouseX;
      const dy = my - this.startMouseY;
      
      for (let el of selectedElements) {
        el.x = el.startX + dx;
        el.y = el.startY + dy;
      }
    }

    // パネルの値を更新
    if (system) {
      system.refreshPane();
    }
  }

  onReleased() {
    this.isDragging = false;
    this.transformMode = null;
  }
}
