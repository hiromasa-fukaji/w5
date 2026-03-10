class DesignSystem {
  constructor() {
    this.elements = [];
    this.clipboard = [];
    this.pasteOffset = 0;
    this.currentTool = 'select';
    this.history = [];
    this.transformManager = new TransformManager();
    this.pane = new Tweakpane.Pane();
    this.backgroundColor = '#c8c8c8'; // デフォルトは200のグレー（#c8c8c8）
    this.selectedParams = {
      name: '',
      tag: '',
      visible: true,
      x: 0,
      y: 0,
      scale: 1,
      angle: 0,
      color: '#ffffff',
      fontSize: 40,
      font: 'Helvetica Neue',
      tintColor: '#ffffff',
      opacity: 1
    };
    this.nameInput = null;
    this.tagInput = null;
    this.visibleInput = null;
    this.colorInput = null;
    this.fontSizeInput = null;
    this.fontInput = null;
    this.tintColorInput = null;
    this.opacityInput = null;
    this.selectToolButton = null;
    this.textToolButton = null;
    this.isRefreshingPane = false; // ★pane.refresh()中かどうかのフラグ
    this.editingTextElement = null; // ★編集中のテキスト要素
    this.textEditInput = null; // ★テキスト編集用のinput要素
    this._isLoading = false; // ★読み込み中フラグ（saveLocal()を防ぐため）
    this._autoSaveDisabled = false; // ★オートセーブ無効化フラグ（容量オーバー時）
    this._tempUndoState = null; // ★ドラッグ開始時の状態を一時保存する変数
    this.setupPane();
    this.setupEventListeners();

    // ★起動時にローカルストレージから自動復元
    this.loadLocal();

    // ★追加: 自動更新システムを有効化
    this._enableAutoUpdate();
  }

  setupEventListeners() {
    // キャンバスのクリックイベントリスナーを追加（テキストツール用）
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
      canvas.addEventListener('click', (e) => this.handleCanvasClickEvent(e));
      // ★ダブルクリックイベントリスナーを追加（テキスト編集用）
      canvas.addEventListener('dblclick', (e) => this.handleDoubleClickEvent(e));
    }

    // キーボードイベントリスナーを追加
    window.addEventListener('keydown', (e) => this.handleKeyPressed(e));

    // ★進化ポイント: p5.jsのマウス関数を「乗っ取る」のではなく「ラップする」
    // 既に定義されている関数（学生やAIが書いたもの）を退避
    const oldPressed = window.mousePressed;
    const oldDragged = window.mouseDragged;
    const oldReleased = window.mouseReleased;

    // システムの処理をした後に、元の処理も呼んであげる
    window.mousePressed = (e) => {
      // システムの選択処理（キャンバス上のみ）
      if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        this.handleMousePressed(e, mouseX, mouseY);
      }
      // 学生/AIのコードを実行
      if (typeof oldPressed === 'function') return oldPressed(e);
    };

    window.mouseDragged = (e) => {
      this.handleMouseDragged(mouseX, mouseY);
      if (typeof oldDragged === 'function') return oldDragged(e);
    };

    window.mouseReleased = (e) => {
      this.handleMouseReleased();
      if (typeof oldReleased === 'function') return oldReleased(e);
    };
  }

  handleCanvasClickEvent(e) {
    if (this.currentTool === 'text') {
      e.preventDefault();
      e.stopPropagation();

      // キャンバス内の相対座標を計算
      const rect = e.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.handleCanvasClick(x, y, e);
    }
  }

  // ★ダブルクリックイベントハンドラー（テキスト編集用）
  handleDoubleClickEvent(e) {
    // 編集中の場合は何もしない
    if (this.editingTextElement) {
      return;
    }

    // キャンバス内の相対座標を計算
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // クリック位置にあるTextElementを探す
    let clickedTextElement = null;
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (el instanceof TextElement && el.contains(x, y)) {
        clickedTextElement = el;
        break;
      }
    }

    // TextElementがクリックされた場合、編集モードに入る
    if (clickedTextElement) {
      e.preventDefault();
      e.stopPropagation();
      this.startTextEdit(clickedTextElement, e);
    }
  }

  // ★テキスト編集を開始
  startTextEdit(textElement, e) {
    // 既存の編集inputがあれば削除
    if (this.textEditInput) {
      this.textEditInput.remove();
      this.textEditInput = null;
    }

    this.editingTextElement = textElement;

    // HTMLの入力要素を作成
    const input = createInput(textElement.text);
    this.textEditInput = input;

    // テキスト要素の位置とスタイルに合わせてinputを配置
    const rect = e.target.getBoundingClientRect();
    const canvasX = textElement.x;
    const canvasY = textElement.y;

    // キャンバス座標を画面座標に変換
    const screenX = rect.left + canvasX;
    const screenY = rect.top + canvasY;

    input.position(screenX, screenY);

    // テキスト要素のスタイルを反映
    const [r, g, b] = textElement._getRGBFromHex(textElement.color);
    const alpha = Math.max(0, Math.min(1, textElement.opacity)) * 255;

    // 回転を考慮したtransform（ラジアンを度に変換）
    const rotationDeg = (textElement.angle * 180) / Math.PI;
    const transformValue = `translate(-50%, -50%) rotate(${rotationDeg}deg)`;

    input.style('background', 'transparent');
    input.style('border', 'none');
    input.style('outline', 'none');
    input.style('color', `rgba(${r}, ${g}, ${b}, ${alpha / 255})`);
    input.style('font-size', `${textElement.fontSize * textElement.scale}px`);
    input.style('font-family', textElement.font);
    input.style('text-align', 'center');
    input.style('transform', transformValue);
    input.style('transform-origin', 'center center');
    input.style('pointer-events', 'auto');

    // テキスト全体を選択
    input.elt.focus();
    input.elt.select();

    // Enterキー押下時の処理
    input.elt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.finishTextEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelTextEdit();
      }
    });

    // フォーカスが外れた時の処理
    input.elt.addEventListener('blur', () => {
      // 少し遅延させて、Enterキーの処理が先に実行されるようにする
      setTimeout(() => {
        if (this.editingTextElement === textElement) {
          this.finishTextEdit();
        }
      }, 100);
    });
  }

  // ★テキスト編集を確定
  finishTextEdit() {
    if (!this.editingTextElement || !this.textEditInput) {
      return;
    }

    const newText = this.textEditInput.value();

    // テキストが変更されていた場合のみ保存
    if (newText !== this.editingTextElement.text) {
      this.saveState();
      this.editingTextElement.text = newText;
      this.editingTextElement.version++; // バージョンを更新
      this.saveLocal(); // オートセーブ
    }

    // 編集inputを削除
    this.textEditInput.remove();
    this.textEditInput = null;
    this.editingTextElement = null;
  }

  // ★テキスト編集をキャンセル
  cancelTextEdit() {
    if (!this.textEditInput) {
      return;
    }

    // 編集inputを削除（変更は保存しない）
    this.textEditInput.remove();
    this.textEditInput = null;
    this.editingTextElement = null;
  }

  setupPane() {
    // 名前（ID）入力欄を追加
    this.nameInput = this.pane.addInput(this.selectedParams, 'name', {
      label: 'Name (ID)'
    });

    // 名前入力欄専用のイベントリスナー（リアルタイム更新用）
    this.nameInput.on('change', (ev) => {
      const selectedElement = this.elements.find(el => el.isSelected);
      if (selectedElement) {
        selectedElement.name = ev.value;
      }
    });

    // DOM要素に直接アクセスして、入力中にもリアルタイム更新
    setTimeout(() => {
      const nameInputElement = this.nameInput.controller_.view.element.querySelector('input');
      if (nameInputElement) {
        nameInputElement.addEventListener('input', (e) => {
          const selectedElement = this.elements.find(el => el.isSelected);
          if (selectedElement) {
            selectedElement.name = e.target.value;
            this.selectedParams.name = e.target.value;
          }
        });
      }
    }, 100);

    // タグ（グループ）入力欄を追加
    this.tagInput = this.pane.addInput(this.selectedParams, 'tag', {
      label: 'Tag (Group)'
    });

    // タグ入力欄専用のイベントリスナー（リアルタイム更新用）
    this.tagInput.on('change', (ev) => {
      const selectedElement = this.elements.find(el => el.isSelected);
      if (selectedElement) {
        selectedElement.tag = ev.value;
      }
    });

    // DOM要素に直接アクセスして、入力中にもリアルタイム更新
    setTimeout(() => {
      const tagInputElement = this.tagInput.controller_.view.element.querySelector('input');
      if (tagInputElement) {
        tagInputElement.addEventListener('input', (e) => {
          const selectedElement = this.elements.find(el => el.isSelected);
          if (selectedElement) {
            selectedElement.tag = e.target.value;
            this.selectedParams.tag = e.target.value;
          }
        });
      }
    }, 100);

    // 表示/非表示のスイッチを追加
    this.visibleInput = this.pane.addInput(this.selectedParams, 'visible', {
      label: 'Show Original'
    });

    this.visibleInput.on('change', (ev) => {
      if (this.isRefreshingPane) return;

      const selectedElement = this.elements.find(el => el.isSelected);
      if (selectedElement) {
        // 変更時にステート保存
        this.saveState();

        selectedElement.visible = ev.value;
        selectedElement.version++; // 変更検知のためにバージョンも上げる

        this.saveLocal(); // オートセーブ
      }
    });

    this.pane.addInput(this.selectedParams, 'x', { min: -1000, max: 2000, step: 1 });
    this.pane.addInput(this.selectedParams, 'y', { min: -1000, max: 2000, step: 1 });
    this.pane.addInput(this.selectedParams, 'scale', { min: 0.1, max: 5, step: 0.1 });
    this.pane.addInput(this.selectedParams, 'angle', { min: -PI, max: PI, step: 0.1 });

    // TextElement用のフィールド
    this.colorInput = this.pane.addInput(this.selectedParams, 'color');
    this.fontSizeInput = this.pane.addInput(this.selectedParams, 'fontSize', { min: 10, max: 300, step: 1 });
    this.fontInput = this.pane.addInput(this.selectedParams, 'font', {
      options: {
        'Helvetica Neue': 'Helvetica Neue',
        'HelveticaNeue-Light': 'HelveticaNeue-Light',
        'HelveticaNeue-Bold': 'HelveticaNeue-Bold',
        'HelveticaNeue-Medium': 'HelveticaNeue-Medium',
        'HelveticaNeue-Thin': 'HelveticaNeue-Thin',
        'HelveticaNeue-UltraLight': 'HelveticaNeue-UltraLight',
        'HelveticaNeue-CondensedBold': 'HelveticaNeue-CondensedBold',
        'HelveticaNeue-CondensedBlack': 'HelveticaNeue-CondensedBlack',
        'IBM Plex Mono': 'IBM Plex Mono',
        'IBM Plex Mono medium': 'IBM Plex Mono medium',
        'IBM Plex Mono semibold': 'IBM Plex Mono semibold',
        'IBM Plex Mono light': 'IBM Plex Mono light',
        'IBM Plex Mono thin': 'IBM Plex Mono thin',
        'sans-serif': 'sans-serif',
        'monospace': 'monospace',
        'Arial': 'Arial',
        'Times New Roman': 'Times New Roman',
        'Courier New': 'Courier New',
        'Georgia': 'Georgia',
        'Futura': 'Futura',
        'Avenir Next': 'Avenir Next',
        'YuMincho': 'YuMincho',
        'YuGothic': 'YuGothic',
        'Baskerville': 'Baskerville',
        'Didot': 'Didot',
        'Optima': 'Optima',
        'Copperplate': 'Copperplate',
        'American Typewriter': 'American Typewriter',

      }
    });

    // ImageElement用のフィールド
    this.tintColorInput = this.pane.addInput(this.selectedParams, 'tintColor');

    // 共通フィールド: 不透明度
    this.opacityInput = this.pane.addInput(this.selectedParams, 'opacity', {
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.01
    });

    // 値が変更されたら選択中のオブジェクトのプロパティを更新
    let changeTimeout = null;
    let hasSavedBeforeChange = false;
    this.pane.on('change', (ev) => {
      // ★refreshPane()中の変更は無視（ループ防止）
      if (this.isRefreshingPane) {
        return;
      }

      const selectedElement = this.elements.find(el => el.isSelected);
      if (selectedElement) {
        // 変更開始時に状態を保存（最初の変更時のみ）
        if (!hasSavedBeforeChange) {
          this.saveState();
          hasSavedBeforeChange = true;
        }

        // ★変更があったらバージョンを上げる
        selectedElement.version++;

        selectedElement.x = this.selectedParams.x;
        selectedElement.y = this.selectedParams.y;
        selectedElement.scale = this.selectedParams.scale;
        selectedElement.angle = this.selectedParams.angle;

        if (selectedElement instanceof TextElement) {
          selectedElement.color = this.selectedParams.color;
          selectedElement.fontSize = this.selectedParams.fontSize;
          selectedElement.font = this.selectedParams.font;
          selectedElement.opacity = this.selectedParams.opacity;
        } else if (selectedElement instanceof ImageElement) {
          selectedElement.tintColor = this.selectedParams.tintColor;
          selectedElement.opacity = this.selectedParams.opacity;
        } else if (selectedElement instanceof VectorElement) {
          selectedElement.color = this.selectedParams.color;
          selectedElement.opacity = this.selectedParams.opacity;
        }

        // 変更が終了したらフラグをリセット（デバウンス）し、オートセーブ
        if (changeTimeout) clearTimeout(changeTimeout);
        changeTimeout = setTimeout(() => {
          hasSavedBeforeChange = false;
          this.saveLocal(); // ★オートセーブ
        }, 500);
      }
    });

    // Canvasフォルダ（背景色設定）
    const canvasFolder = this.pane.addFolder({ title: 'Canvas' });
    canvasFolder.addInput(this, 'backgroundColor', {
      label: 'Background Color'
    }).on('change', (ev) => {
      this.backgroundColor = ev.value;
      this.saveLocal(); // ★オートセーブ
    });

    // Toolsフォルダ
    const toolsFolder = this.pane.addFolder({ title: 'Tools' });
    this.selectToolButton = toolsFolder.addButton({ title: 'Select Tool' });
    this.selectToolButton.on('click', () => this.activateSelectTool());
    this.textToolButton = toolsFolder.addButton({ title: 'Text Tool' });
    this.textToolButton.on('click', () => this.activateTextTool());

    // 初期状態（Select Toolが選択されている）
    this.updateToolButtonStyles();

    // Layoutフォルダ（整列機能）
    const layoutFolder = this.pane.addFolder({ title: 'Layout' });
    layoutFolder.addButton({ title: 'Align Left' }).on('click', () => this.alignLeft());
    layoutFolder.addButton({ title: 'Align Center' }).on('click', () => this.alignCenter());
    layoutFolder.addButton({ title: 'Align Right' }).on('click', () => this.alignRight());
    layoutFolder.addButton({ title: 'Align Top' }).on('click', () => this.alignTop());
    layoutFolder.addButton({ title: 'Align Middle' }).on('click', () => this.alignMiddle());
    layoutFolder.addButton({ title: 'Align Bottom' }).on('click', () => this.alignBottom());

    // Layersフォルダ（重ね順機能）
    const layersFolder = this.pane.addFolder({ title: 'Layers' });
    layersFolder.addButton({ title: 'Bring to Front' }).on('click', () => this.bringToFront());
    layersFolder.addButton({ title: 'Send to Back' }).on('click', () => this.sendToBack());
    layersFolder.addButton({ title: 'Bring Forward' }).on('click', () => this.bringForward());
    layersFolder.addButton({ title: 'Send Backward' }).on('click', () => this.sendBackward());

    // Projectフォルダ（保存・読み込み機能）
    const projectFolder = this.pane.addFolder({ title: 'Project' });
    projectFolder.addButton({ title: 'Save Project (JSON)' }).on('click', () => this.exportJSON());
    projectFolder.addButton({ title: 'Load Project' }).on('click', () => this.openLoadDialog());
    projectFolder.addButton({ title: 'Clear Auto-save' }).on('click', () => this.clearAutoSave());
    projectFolder.addButton({ title: 'Export PNG' }).on('click', () => this.exportImage());
    projectFolder.addButton({ title: 'Export SVG' }).on('click', () => this.exportSVG());
  }

  refreshPane() {
    // ★フラグをセットして、change イベントが要素を上書きしないようにする
    this.isRefreshingPane = true;

    const selectedElement = this.elements.find(el => el.isSelected);
    if (selectedElement) {
      // 名前とタグを読み込んでパネルにセット
      this.selectedParams.name = selectedElement.name || '';
      this.selectedParams.tag = selectedElement.tag || '';

      // 要素に visible プロパティがなければ true (表示) とみなす
      this.selectedParams.visible = (selectedElement.visible !== false);

      this.selectedParams.x = selectedElement.x;
      this.selectedParams.y = selectedElement.y;
      this.selectedParams.scale = selectedElement.scale;
      this.selectedParams.angle = selectedElement.angle;
      this.selectedParams.opacity = (typeof selectedElement.opacity === 'number') ? selectedElement.opacity : 1;

      // 要素タイプに応じてフィールドを表示/非表示
      if (selectedElement instanceof TextElement) {
        this.selectedParams.color = selectedElement.color;
        this.selectedParams.fontSize = selectedElement.fontSize;
        this.selectedParams.font = selectedElement.font;
        this.colorInput.hidden = false;
        this.fontSizeInput.hidden = false;
        this.fontInput.hidden = false;
        this.tintColorInput.hidden = true;
        this.opacityInput.hidden = false;
      } else if (selectedElement instanceof ImageElement) {
        this.selectedParams.tintColor = selectedElement.tintColor;
        this.colorInput.hidden = true;
        this.fontSizeInput.hidden = true;
        this.fontInput.hidden = true;
        this.tintColorInput.hidden = false;
        this.opacityInput.hidden = false;
      } else if (selectedElement instanceof VectorElement) {
        this.selectedParams.color = selectedElement.color;
        this.colorInput.hidden = false;
        this.fontSizeInput.hidden = true;
        this.fontInput.hidden = true;
        this.tintColorInput.hidden = true;
        this.opacityInput.hidden = false;
      } else {
        this.colorInput.hidden = true;
        this.fontSizeInput.hidden = true;
        this.fontInput.hidden = true;
        this.tintColorInput.hidden = true;
        this.opacityInput.hidden = true;
      }

      this.pane.refresh();
    } else {
      // 選択解除されたら、Name欄とTag欄を空にする
      this.selectedParams.name = '';
      this.selectedParams.tag = '';
      this.pane.refresh();
    }

    // ★フラグを解除
    this.isRefreshingPane = false;
  }

  updateToolButtonStyles() {
    // DOMからボタン要素を検索（Tweakpaneの構造に依存）
    setTimeout(() => {
      const paneElement = this.pane.element;
      if (!paneElement) return;

      // すべてのボタン要素を取得
      const buttons = paneElement.querySelectorAll('button');
      let selectButton = null;
      let textButton = null;

      // ボタンのテキストで識別
      buttons.forEach(btn => {
        const text = btn.textContent.trim();
        if (text === 'Select Tool') {
          selectButton = btn;
        } else if (text === 'Text Tool') {
          textButton = btn;
        }
      });

      if (selectButton && textButton) {
        if (this.currentTool === 'select') {
          // Select Toolがアクティブ
          selectButton.style.backgroundColor = '#404040'; // 濃いグレー
          selectButton.style.color = '#ffffff'; // 白
          textButton.style.backgroundColor = '';
          textButton.style.color = '';
        } else if (this.currentTool === 'text') {
          // Text Toolがアクティブ
          textButton.style.backgroundColor = '#404040'; // 濃いグレー
          textButton.style.color = '#ffffff'; // 白
          selectButton.style.backgroundColor = '';
          selectButton.style.color = '';
        }
      }
    }, 0);
  }

  activateTextTool() {
    this.currentTool = 'text';
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
      canvas.style.cursor = 'text';
    }
    this.updateToolButtonStyles();
  }

  activateSelectTool() {
    this.currentTool = 'select';
    const canvas = document.getElementById('main-canvas');
    if (canvas) {
      canvas.style.cursor = 'default';
    }
    this.updateToolButtonStyles();
  }

  handleCanvasClick(x, y, e) {
    if (this.currentTool === 'text') {
      // HTMLの入力要素を作成
      const input = createInput('');

      // 表示位置にはイベントの絶対座標(clientX, clientY)を使う
      if (e) {
        input.position(e.clientX, e.clientY);
      } else {
        input.position(x, y);
      }

      input.style('background', 'transparent');
      input.style('border', 'none');
      input.style('outline', 'none');
      input.style('color', '#ffffff');
      input.style('font-size', '40px');
      input.style('font-family', 'Helvetica Neue');
      input.style('text-align', 'center');
      input.style('transform', 'translate(-50%, -50%)');
      input.elt.focus();

      // Enterキー押下時の処理
      input.elt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const value = input.value();
          if (value.trim() !== '') {
            // キャンバス座標のx, yを使う
            this.addText(x, y, value);
          }
          input.remove();
          this.activateSelectTool();
        }
      });

      // フォーカスが外れた時の処理
      input.elt.addEventListener('blur', () => {
        const value = input.value();
        if (value.trim() !== '') {
          // キャンバス座標のx, yを使う
          this.addText(x, y, value);
        }
        input.remove();
        this.activateSelectTool();
      });
    }
  }

  saveState() {
    // 現在のelementsをすべてクローンして履歴に保存
    const clonedElements = this.elements.map(el => el.clone());
    this.history.push(clonedElements);

    // 履歴が30個を超えたら古いものを削除
    if (this.history.length > 30) {
      this.history.shift();
    }
  }

  undo() {
    if (this.history.length === 0) return;

    // 最後の状態を復元
    const previousState = this.history.pop();
    this.elements = previousState.map(el => el.clone());
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  // ★名前（ID）で要素を探すメソッド（スケッチから呼び出す用）
  get(name) {
    return this.elements.find(el => el.name === name);
  }

  // ★タグ（グループ）で要素を探すメソッド
  getGroup(tag) {
    return this.elements.filter(el => el.tag === tag);
  }

  // --- 内部ヘルパー: ID単体またはタグ（グループ）から対象要素の配列を作る ---
  _resolveTargets(nameOrTag) {
    const single = this.get(nameOrTag);
    if (single) return [single];
    return this.getGroup(nameOrTag);
  }

  /**
   * 指定した要素の形状（点）の上に描画を行うラッパーメソッド
   * @param {string} nameOrTag - 対象のIDまたはタグ
   * @param {object} options - { step: 1, color: 'red', alpha: 255 } など
   * @param {function} drawAction - (x, y, index) => { ... } 描画処理
   */
  drawOnPoints(nameOrTag, options = {}, drawAction = null) {
    const targets = this._resolveTargets(nameOrTag);

    // デフォルト設定
    const config = {
      step: 1,      // 点の間隔（精度）
      color: null,  // 指定がなければ要素の色を使う
      alpha: 255    // 透明度
    };
    Object.assign(config, options);

    for (const el of targets) {
      // 形状取得できない要素はスキップ
      if (typeof el.getPoints !== 'function') continue;

      // ★ここで面倒な座標変換を全部やる
      push();
      translate(el.x, el.y);
      rotate(el.angle);
      scale(el.scale);

      // 点を取得
      const points = el.getPoints(config.step);

      // 色の設定（p5.jsのcolor関数を使用）
      const c = config.color || el.color;
      const baseColor = color(c);
      baseColor.setAlpha(config.alpha);
      fill(baseColor);
      noStroke();

      // ★描画実行
      if (typeof drawAction === 'function') {
        // カスタム描画: 学生が書いた関数を実行
        points.forEach((p, i) => drawAction(p.x, p.y, i));
      } else {
        // 指定がなければデフォルトで丸を描く
        points.forEach(p => circle(p.x, p.y, 1));
      }

      pop();
    }
  }

  /**
   * ★進化ポイント2: 魔法の地図（drawInside）
   * 要素の内部座標系（魔法の地図）で描画を行う
   * @param {string} nameOrTag - 対象のIDまたはタグ
   * @param {function} drawAction - (ctx) => { ... } 描画処理。
   * ctx.mouseX, ctx.mouseY には、回転などを考慮したローカル座標が入る
   */
  drawInside(nameOrTag, drawAction) {
    const targets = this._resolveTargets(nameOrTag);

    // デバッグ用：処理をスキップしてフリーズを回避
    if (targets.length === 0) return;

    for (const el of targets) {
      // 要素ごとに専用のデータ保存場所（ポケット）を確保
      if (!el._state) {
        el._state = {};
        // ★初回実行時に自動的にバージョンを記録（elementChanged()が誤検知しないように）
        el._state._lastVersion = el.version;
      }

      push();
      translate(el.x, el.y);
      rotate(el.angle);
      scale(el.scale);

      // ローカル座標系でのマウス位置を計算
      const dx = mouseX - el.x;
      const dy = mouseY - el.y;
      const cosA = cos(-el.angle);
      const sinA = sin(-el.angle);
      const lmx = (dx * cosA - dy * sinA) / el.scale;
      const lmy = (dx * sinA + dy * cosA) / el.scale;

      const context = {
        mouseX: lmx,
        mouseY: lmy,
        element: el,
        // ★この 'state' が魔法のポケットです
        state: el._state,
        isHover: el.contains(mouseX, mouseY),
        width: el.getWidth(),
        height: el.getHeight(),

        // ★要素のプロパティが変更されたか検知
        elementChanged: () => {
          // 前回のバージョンを記録していない、または異なる場合はtrue
          return el._state._lastVersion !== undefined && el._state._lastVersion !== el.version;
        },

        // ★現在のバージョンを記録（変更を処理済みとしてマーク）
        markAsProcessed: () => {
          el._state._lastVersion = el.version;
        },

        // ★ TextElement専用の便利プロパティ
        get fontSize() {
          return el instanceof TextElement ? el.fontSize : null;
        },

        // ★ 魔法のメソッド：これ一発で「文字なら文字、図形なら図形」を描く
        drawAuto: (x = 0, y = 0) => {
          if (el instanceof TextElement) {
            // テキスト要素の場合
            const [r, g, b] = el._getRGBFromHex(el.color);
            fill(r, g, b, el.opacity * 255);
            noStroke();
            textAlign(CENTER, CENTER);
            textFont(el.font);
            textSize(el.fontSize);
            text(el.text, x, y);
          } else if (el instanceof VectorElement) {
            // SVG要素の場合：contoursを使って直接描画
            const [r, g, b] = el._getRGBFromHex(el.color);
            fill(r, g, b, el.opacity * 255);
            noStroke();

            push();
            translate(x, y);
            beginShape();

            if (el.contours.length > 0) {
              for (let p of el.contours[0]) {
                vertex(p.x - el.centerX, p.y - el.centerY);
              }
            }

            for (let i = 1; i < el.contours.length; i++) {
              beginContour();
              for (let p of el.contours[i]) {
                vertex(p.x - el.centerX, p.y - el.centerY);
              }
              endContour();
            }

            endShape(CLOSE);
            pop();
          } else if (el instanceof ImageElement) {
            // 画像要素の場合：画像を直接描画
            const [r, g, b] = el._getRGBFromHex(el.tintColor);
            const alpha = Math.max(0, Math.min(1, el.opacity)) * 255;
            tint(r, g, b, alpha);
            imageMode(CENTER);
            image(el.img, x, y);
            noTint(); // リセット
          }
        }
      };

      // 描画アクションを実行
      drawAction(context);

      pop();
    }
  }

  // ★指定したIDの要素から形状の点リストを取得する（共通窓口）
  getPointsOf(name, step = 5) {
    const el = this.get(name);
    if (!el) return [];

    // ★要素のサイズに応じてstepを正規化（密度を統一）
    // 基準サイズ（100x100）に対する比率でstepを調整
    const baseSize = 100;
    const elementArea = el.getWidth() * el.getHeight();
    const normalizedStep = step * Math.sqrt(elementArea / (baseSize * baseSize));

    // 各要素クラスに実装した getPoints を呼び出す
    if (typeof el.getPoints === 'function') {
      return el.getPoints(normalizedStep);
    }
    return [];
  }

  // ★グループを一斉に相対移動させる
  moveGroup(tag, dx, dy) {
    const group = this.getGroup(tag);
    group.forEach(el => {
      el.x += dx;
      el.y += dy;
    });
  }

  // ★グループを一斉に回転させる
  rotateGroup(tag, angle) {
    const group = this.getGroup(tag);
    group.forEach(el => {
      el.angle += angle;
    });
  }

  // ★グループを一斉に拡大縮小させる
  scaleGroup(tag, scaleAmount) {
    const group = this.getGroup(tag);
    group.forEach(el => {
      el.scale *= scaleAmount;
    });
  }

  addText(x, y, content, skipHistory = false, name = "", tag = "") {
    if (!skipHistory) {
      this.saveState();
    }
    const textElement = new TextElement(x, y, content, name, tag);
    this.elements.push(textElement);
    this.saveLocal(); // ★オートセーブ
  }

  addImage(x, y, img, name = "", tag = "") {
    this.saveState();
    const imageElement = new ImageElement(x, y, img, name, tag);
    this.elements.push(imageElement);
    this.saveLocal(); // ★オートセーブ
  }

  addVector(x, y, svgString, name = "", tag = "") {
    this.saveState();
    const vectorElement = new VectorElement(x, y, svgString, name, tag);
    this.elements.push(vectorElement);
    this.saveLocal(); // ★オートセーブ
  }

  deleteSelected() {
    this.saveState();
    // isSelectedがtrueの要素をすべて取り除く
    this.elements = this.elements.filter(element => !element.isSelected);
    // パネルを更新（何も選択されていない状態に戻すため）
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  copySelected() {
    // 選択中の要素をクリップボードにコピー
    this.clipboard = [];
    this.pasteOffset = 0; // コピーしたときはリセット
    for (let element of this.elements) {
      if (element.isSelected) {
        this.clipboard.push(element.clone());
      }
    }
  }

  pasteClipboard() {
    // クリップボードが空なら何もしない
    if (this.clipboard.length === 0) return;

    this.saveState();

    // 現在の選択をすべて解除
    for (let element of this.elements) {
      element.isSelected = false;
    }

    // オフセットを更新（ペーストするたびに20ずつ増える）
    this.pasteOffset += 20;

    // クリップボードの中身は「書き換えない」で読み取るだけ
    for (let clipElement of this.clipboard) {
      const newElement = clipElement.clone(); // 元のコピーから生成

      // オフセット分だけずらす
      newElement.x += this.pasteOffset;
      newElement.y += this.pasteOffset;

      newElement.isSelected = true;
      this.elements.push(newElement);
    }

    // パネルを更新
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  // --- 重ね順（配列の順序入れ替え） ---
  bringToFront() {
    this.saveState();
    const selectedIndex = this.elements.findIndex(el => el.isSelected);
    if (selectedIndex !== -1) {
      const element = this.elements[selectedIndex];
      this.elements.splice(selectedIndex, 1);
      this.elements.push(element);
      this.refreshPane();
      this.saveLocal(); // ★オートセーブ
    }
  }

  sendToBack() {
    this.saveState();
    const selectedIndex = this.elements.findIndex(el => el.isSelected);
    if (selectedIndex !== -1) {
      const element = this.elements[selectedIndex];
      this.elements.splice(selectedIndex, 1);
      this.elements.unshift(element);
      this.refreshPane();
      this.saveLocal(); // ★オートセーブ
    }
  }

  bringForward() {
    this.saveState();
    const selectedIndex = this.elements.findIndex(el => el.isSelected);
    if (selectedIndex !== -1 && selectedIndex < this.elements.length - 1) {
      // 次の要素と交換
      [this.elements[selectedIndex], this.elements[selectedIndex + 1]] =
        [this.elements[selectedIndex + 1], this.elements[selectedIndex]];
      this.refreshPane();
      this.saveLocal(); // ★オートセーブ
    }
  }

  sendBackward() {
    this.saveState();
    const selectedIndex = this.elements.findIndex(el => el.isSelected);
    if (selectedIndex !== -1 && selectedIndex > 0) {
      // 前の要素と交換
      [this.elements[selectedIndex], this.elements[selectedIndex - 1]] =
        [this.elements[selectedIndex - 1], this.elements[selectedIndex]];
      this.refreshPane();
      this.saveLocal(); // ★オートセーブ
    }
  }

  // --- 整列（キャンバス基準/複数選択対応） ---
  alignLeft() {
    this.saveState();
    const selectedElements = this.elements.filter(el => el.isSelected);
    if (selectedElements.length === 0) return;

    if (selectedElements.length === 1) {
      // 単一選択：キャンバス基準で左揃え
      const element = selectedElements[0];
      const halfWidth = element.getWidth() * element.scale / 2;
      element.x = halfWidth;
    } else {
      // 複数選択：選択要素内で左端に揃える
      let minX = Infinity;
      for (let el of selectedElements) {
        const leftEdge = el.x - (el.getWidth() * el.scale / 2);
        minX = Math.min(minX, leftEdge);
      }
      for (let el of selectedElements) {
        const halfWidth = el.getWidth() * el.scale / 2;
        el.x = minX + halfWidth;
      }
    }
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  alignCenter() {
    this.saveState();
    const selectedElements = this.elements.filter(el => el.isSelected);
    if (selectedElements.length === 0) return;

    if (selectedElements.length === 1) {
      // 単一選択：キャンバス中央に配置
      selectedElements[0].x = width / 2;
    } else {
      // 複数選択：選択要素全体の中央に揃える
      let minX = Infinity, maxX = -Infinity;
      for (let el of selectedElements) {
        const halfWidth = el.getWidth() * el.scale / 2;
        minX = Math.min(minX, el.x - halfWidth);
        maxX = Math.max(maxX, el.x + halfWidth);
      }
      const centerX = (minX + maxX) / 2;
      for (let el of selectedElements) {
        el.x = centerX;
      }
    }
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  alignRight() {
    this.saveState();
    const selectedElements = this.elements.filter(el => el.isSelected);
    if (selectedElements.length === 0) return;

    if (selectedElements.length === 1) {
      // 単一選択：キャンバス基準で右揃え
      const element = selectedElements[0];
      const halfWidth = element.getWidth() * element.scale / 2;
      element.x = width - halfWidth;
    } else {
      // 複数選択：選択要素内で右端に揃える
      let maxX = -Infinity;
      for (let el of selectedElements) {
        const rightEdge = el.x + (el.getWidth() * el.scale / 2);
        maxX = Math.max(maxX, rightEdge);
      }
      for (let el of selectedElements) {
        const halfWidth = el.getWidth() * el.scale / 2;
        el.x = maxX - halfWidth;
      }
    }
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  alignTop() {
    this.saveState();
    const selectedElements = this.elements.filter(el => el.isSelected);
    if (selectedElements.length === 0) return;

    if (selectedElements.length === 1) {
      // 単一選択：キャンバス基準で上揃え
      const element = selectedElements[0];
      const halfHeight = element.getHeight() * element.scale / 2;
      element.y = halfHeight;
    } else {
      // 複数選択：選択要素内で上端に揃える
      let minY = Infinity;
      for (let el of selectedElements) {
        const topEdge = el.y - (el.getHeight() * el.scale / 2);
        minY = Math.min(minY, topEdge);
      }
      for (let el of selectedElements) {
        const halfHeight = el.getHeight() * el.scale / 2;
        el.y = minY + halfHeight;
      }
    }
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  alignMiddle() {
    this.saveState();
    const selectedElements = this.elements.filter(el => el.isSelected);
    if (selectedElements.length === 0) return;

    if (selectedElements.length === 1) {
      // 単一選択：キャンバス中央に配置
      selectedElements[0].y = height / 2;
    } else {
      // 複数選択：選択要素全体の中央に揃える
      let minY = Infinity, maxY = -Infinity;
      for (let el of selectedElements) {
        const halfHeight = el.getHeight() * el.scale / 2;
        minY = Math.min(minY, el.y - halfHeight);
        maxY = Math.max(maxY, el.y + halfHeight);
      }
      const centerY = (minY + maxY) / 2;
      for (let el of selectedElements) {
        el.y = centerY;
      }
    }
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  alignBottom() {
    this.saveState();
    const selectedElements = this.elements.filter(el => el.isSelected);
    if (selectedElements.length === 0) return;

    if (selectedElements.length === 1) {
      // 単一選択：キャンバス基準で下揃え
      const element = selectedElements[0];
      const halfHeight = element.getHeight() * element.scale / 2;
      element.y = height - halfHeight;
    } else {
      // 複数選択：選択要素内で下端に揃える
      let maxY = -Infinity;
      for (let el of selectedElements) {
        const bottomEdge = el.y + (el.getHeight() * el.scale / 2);
        maxY = Math.max(maxY, bottomEdge);
      }
      for (let el of selectedElements) {
        const halfHeight = el.getHeight() * el.scale / 2;
        el.y = maxY - halfHeight;
      }
    }
    this.refreshPane();
    this.saveLocal(); // ★オートセーブ
  }

  render(options = { skipBackground: false }) {
    // キャンバスの背景色を設定
    if (!options.skipBackground) {
      background(this.getBackgroundColor());
    }

    for (let element of this.elements) {
      // 各要素の display() メソッド内で visible チェックを行う
      element.display();

      // 選択中の要素の上にIDを表示（visible に関わらず表示）
      if (element.isSelected && element.name) {
        push();
        fill(255); // 白
        noStroke();
        textSize(10);
        textFont('IBM Plex Mono'); // カッコいいフォント
        textAlign(CENTER, BOTTOM);
        // オブジェクトの拡大を考慮して、上部に表示
        const halfHeight = element.getHeight() * element.scale / 2;
        const offsetY = 15; // 上方向へのオフセット
        text(`ID: ${element.name}`, element.x, element.y - halfHeight - offsetY);
        pop();
      }
    }
  }

  // ★新設: データをオブジェクトとして生成するだけのメソッド（保存・書き出し兼用）
  serialize() {
    return {
      version: '1.0',
      backgroundColor: this.backgroundColor,
      elements: this.elements.map(el => {
        if (el instanceof TextElement) {
          return {
            type: 'text',
            name: el.name,
            tag: el.tag,
            visible: el.visible,
            x: el.x,
            y: el.y,
            text: el.text,
            fontSize: el.fontSize,
            font: el.font,
            color: el.color,
            opacity: el.opacity,
            angle: el.angle,
            scale: el.scale
          };
        } else if (el instanceof ImageElement) {
          // 画像をBase64に変換
          try {
            let imageData;

            // p5.Imageのcanvasプロパティが利用可能な場合（Canvas要素として読み込まれた画像）
            if (el.img.canvas) {
              imageData = el.img.canvas.toDataURL('image/png');
            } else if (el.img.elt) {
              // HTMLImageElementとして読み込まれた場合
              const canvas = document.createElement('canvas');
              canvas.width = el.img.width;
              canvas.height = el.img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(el.img.elt, 0, 0);
              imageData = canvas.toDataURL('image/png');
            } else {
              console.warn('Unable to convert image to Base64: no canvas or elt property');
              imageData = '';
            }

            return {
              type: 'image',
              name: el.name,
              tag: el.tag,
              visible: el.visible,
              x: el.x,
              y: el.y,
              imageData: imageData,
              width: el.width,
              height: el.height,
              tintColor: el.tintColor,
              opacity: el.opacity,
              angle: el.angle,
              scale: el.scale
            };
          } catch (err) {
            console.error('Error converting image to Base64:', err);
            // エラーが発生した場合は空の画像データを返す
            return {
              type: 'image',
              name: el.name,
              tag: el.tag,
              visible: el.visible,
              x: el.x,
              y: el.y,
              imageData: '',
              width: el.width,
              height: el.height,
              tintColor: el.tintColor,
              opacity: el.opacity,
              angle: el.angle,
              scale: el.scale
            };
          }
        } else if (el instanceof VectorElement) {
          return {
            type: 'vector',
            name: el.name,
            tag: el.tag,
            visible: el.visible,
            x: el.x,
            y: el.y,
            svgString: el.svgString,
            color: el.color,
            opacity: el.opacity,
            angle: el.angle,
            scale: el.scale
          };
        }
        return null;
      }).filter(el => el !== null)
    };
  }

  // ★修正: exportJSON は serialize を呼んで保存するだけにする
  exportJSON() {
    const data = this.serialize();
    saveJSON(data, 'my-project.json');
  }

  // ★新設: ローカルストレージに自動保存
  saveLocal() {
    // ★読み込み中は保存しない（空のデータで上書きしてしまうのを防ぐ）
    if (this._isLoading) {
      console.log('Skipping saveLocal() - still loading');
      return;
    }

    // ★オートセーブが無効化されている場合はスキップ
    if (this._autoSaveDisabled) {
      return;
    }

    try {
      const data = this.serialize();
      const jsonString = JSON.stringify(data);
      localStorage.setItem('designSystem_autoSave', jsonString);
      // console.log('Auto-saved to localStorage:', data.elements.length, 'elements');
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.warn('⚠️ Auto-save failed: LocalStorage is full. Images might be too large.');
        console.warn('💡 Recommendation: Export your project as JSON and remove large images.');
        // オートセーブを一時的に無効化するフラグを立てる
        if (!this._autoSaveDisabled) {
          this._autoSaveDisabled = true;
          alert('LocalStorageの容量が不足しています。\n画像が大きすぎる可能性があります。\n\n対処法：\n1. プロジェクトをJSON形式で保存してください\n2. 画像を削除するか、サイズを小さくしてください\n\nオートセーブは一時的に無効化されました。');
        }
      } else {
        console.error('Failed to save to localStorage:', err);
      }
    }
  }

  // ★新設: ローカルストレージから自動復元
  loadLocal() {
    try {
      const jsonString = localStorage.getItem('designSystem_autoSave');
      if (jsonString) {
        const data = JSON.parse(jsonString);
        console.log('Loading from localStorage:', data.elements.length, 'elements');
        // ★読み込み中フラグを立てる
        this._isLoading = true;
        this.importJSON(data);
        console.log('Auto-loaded from localStorage');
        return true;
      } else {
        console.log('No auto-save data found in localStorage');
      }
    } catch (err) {
      console.error('Failed to load from localStorage:', err);
    }
    return false;
  }

  // ★新設: オートセーブのクリア
  clearAutoSave() {
    if (confirm('オートセーブデータをクリアして、新規プロジェクトを開始しますか？')) {
      try {
        localStorage.removeItem('designSystem_autoSave');
        this.elements = [];
        this.backgroundColor = '#c8c8c8';
        this.refreshPane();
        console.log('Auto-save cleared');
        alert('オートセーブデータをクリアしました');
      } catch (err) {
        console.error('Failed to clear auto-save:', err);
      }
    }
  }

  openLoadDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            this.importJSON(data);
            // JSONファイルから読み込んだ後はローカルストレージにも保存
            setTimeout(() => this.saveLocal(), 100);
          } catch (err) {
            console.error('JSON parse error:', err);
            alert('JSONファイルの読み込みに失敗しました');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  importJSON(data) {
    if (!data.elements || !Array.isArray(data.elements)) {
      console.error('Invalid JSON format');
      return;
    }

    // 背景色を読み込む（存在する場合）
    if (data.backgroundColor) {
      this.backgroundColor = data.backgroundColor;
      // Tweakpaneのカラーピッカーも更新
      if (this.pane) {
        this.pane.refresh();
      }
    }

    this.elements = [];

    // 各要素を復元
    const loadPromises = data.elements.map(elementData => {
      if (elementData.type === 'text') {
        const el = new TextElement(elementData.x, elementData.y, elementData.text, elementData.name || '', elementData.tag || '');
        el.fontSize = elementData.fontSize || 40;
        el.font = elementData.font || 'Helvetica Neue';
        el.color = elementData.color || '#ffffff';
        el.opacity = (typeof elementData.opacity === 'number') ? elementData.opacity : 1;
        el.angle = elementData.angle || 0;
        el.scale = elementData.scale || 1;
        el.visible = (elementData.visible !== false); // 存在しなければtrue
        return Promise.resolve(el);
      } else if (elementData.type === 'image') {
        return new Promise((resolve) => {
          loadImage(elementData.imageData, (img) => {
            const el = new ImageElement(elementData.x, elementData.y, img, elementData.name || '', elementData.tag || '');
            el.tintColor = elementData.tintColor || '#ffffff';
            el.opacity = (typeof elementData.opacity === 'number') ? elementData.opacity : 1;
            el.angle = elementData.angle || 0;
            el.scale = elementData.scale || 1;
            el.visible = (elementData.visible !== false); // 存在しなければtrue
            resolve(el);
          });
        });
      } else if (elementData.type === 'vector') {
        const el = new VectorElement(elementData.x, elementData.y, elementData.svgString, elementData.name || '', elementData.tag || '');
        el.color = elementData.color || '#ffffff';
        el.opacity = (typeof elementData.opacity === 'number') ? elementData.opacity : 1;
        el.angle = elementData.angle || 0;
        el.scale = elementData.scale || 1;
        el.visible = (elementData.visible !== false); // 存在しなければtrue
        return Promise.resolve(el);
      }
      return Promise.resolve(null);
    });

    // すべての画像読み込みが完了してからelementsに追加
    Promise.all(loadPromises).then(elements => {
      this.elements = elements.filter(el => el !== null);
      console.log('importJSON completed:', this.elements.length, 'elements loaded');
      this.elements.forEach((el, i) => {
        console.log(`  Element ${i}: type=${el.constructor.name}, name="${el.name}", tag="${el.tag}", visible=${el.visible}`);
      });
      this.refreshPane();
      // ★読み込み完了フラグを解除
      this._isLoading = false;
    });
  }

  exportImage() {
    const fileName = `design_${Date.now()}`;
    saveCanvas(fileName, 'png');
  }

  exportSVG() {
    const fileName = `design_${Date.now()}`;

    try {
      // 1. 書き出し専用の「裏キャンバス」をSVGモードで作成
      let svgCanvas = createGraphics(width, height, SVG);

      // 2. 裏キャンバスに背景色を塗る
      const bgColor = this.getBackgroundColor();
      svgCanvas.background(bgColor);

      // 3. 全ての要素を「裏キャンバス」に対して描画する
      for (let el of this.elements) {
        // displayメソッドに描画先(svgCanvas)を渡す
        el.display(svgCanvas);
      }

      // 4. 裏キャンバスを保存する
      svgCanvas.save(fileName);

      // 5. メモリ解放
      svgCanvas.remove();

      console.log('SVG exported successfully:', fileName);
    } catch (err) {
      console.error('SVG export using p5.svg failed, falling back to manual generation:', err);

      // p5.svgが動作しない場合は手動生成にフォールバック
      this.exportSVGManual();
    }
  }

  exportSVGManual() {
    // 手動SVG生成（フォールバック用）
    const fileName = `design_${Date.now()}`;

    // 背景色を取得
    const bgColor = this.getBackgroundColor();

    // SVGヘッダー
    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  
`;

    // 各要素をSVG形式で出力
    for (let el of this.elements) {
      try {
        if (el instanceof TextElement) {
          // テキスト要素
          const transform = `translate(${el.x},${el.y}) rotate(${degrees(el.angle)}) scale(${el.scale})`;
          const escapedText = this.escapeXML(el.text);
          svgContent += `  <text transform="${transform}" font-family="${el.font}" font-size="${el.fontSize}" fill="${el.color}" text-anchor="middle" dominant-baseline="middle">${escapedText}</text>\n`;
        } else if (el instanceof VectorElement) {
          // ベクター要素（中抜き対応）
          if (el.contours && el.contours.length > 0) {
            const transform = `translate(${el.x},${el.y}) rotate(${degrees(el.angle)}) scale(${el.scale})`;

            // ★改善: 全ての輪郭（外枠＋穴）を1つのパスデータとして結合する
            let combinedPathData = '';
            for (let contour of el.contours) {
              for (let i = 0; i < contour.length; i++) {
                const p = contour[i];
                const x = p.x - el.centerX;
                const y = p.y - el.centerY;
                combinedPathData += (i === 0 ? `M ${x},${y}` : ` L ${x},${y}`);
              }
              combinedPathData += ' Z '; // 各輪郭を閉じる
            }

            // ★重要: fill-rule="evenodd" を追加して中抜きを有効化
            svgContent += `  <path d="${combinedPathData}" fill="${el.color}" fill-rule="evenodd" transform="${transform}"/>\n`;
          }
        } else if (el instanceof ImageElement) {
          // 画像要素
          const transform = `translate(${el.x - el.width * el.scale / 2},${el.y - el.height * el.scale / 2}) rotate(${degrees(el.angle)} ${el.width * el.scale / 2} ${el.height * el.scale / 2}) scale(${el.scale})`;

          let imageData = '';
          try {
            if (el.img.canvas) {
              imageData = el.img.canvas.toDataURL('image/png');
            } else if (el.img.elt) {
              const canvas = document.createElement('canvas');
              canvas.width = el.img.width;
              canvas.height = el.img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(el.img.elt, 0, 0);
              imageData = canvas.toDataURL('image/png');
            }

            if (imageData) {
              svgContent += `  <image transform="${transform}" width="${el.width}" height="${el.height}" href="${imageData}"/>\n`;
            }
          } catch (err) {
            console.error('Error converting image for SVG:', err);
          }
        }
      } catch (err) {
        console.error('Error exporting element to SVG:', err, el);
      }
    }

    // SVGフッター
    svgContent += `</svg>`;

    // ダウンロード
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName + '.svg';
    a.click();
    URL.revokeObjectURL(url);

    console.log('SVG exported manually:', fileName);
  }

  // 背景色を取得（sketch.jsのdraw()で使用されている色）
  getBackgroundColor() {
    // 16進数カラー文字列を返す（例: '#c8c8c8'）
    return this.backgroundColor;
  }

  // XMLエスケープ
  escapeXML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // --- イベントハンドラメソッド（sketch.jsから呼ばれる） ---

  handleMousePressed(e, mx, my) {
    // キャンバス外（Tweakpaneやカラーパレットなど）のクリックは無視
    if (e && e.target && e.target.id !== 'main-canvas') {
      return;
    }

    // ★編集中の場合は通常のクリック処理を無視
    if (this.editingTextElement) {
      return;
    }

    // テキストツールモードの場合は、DOMイベントリスナー（handleCanvasClick）で処理されるので何もしない
    if (this.currentTool === 'text') {
      return;
    }

    // ★追加: 操作を始める直前の状態（今の状態）を一時保存しておく
    // これが「Undoした時に戻るべき場所」になります
    this._tempUndoState = this.elements.map(el => el.clone());

    // 選択ツールモード（通常）の場合
    this.transformManager.onPressed(this.elements, mx, my);
    this.refreshPane();
  }

  handleMouseDragged(mx, my) {
    this.transformManager.onDragged(this.elements, mx, my, this);
  }

  handleMouseReleased() {
    const wasTransforming = this.transformManager.isDragging || this.transformManager.transformMode !== null;

    // ドラッグしていた場合もバージョンを上げる（位置・回転・スケールが変わったため）
    if (wasTransforming) {
      const selectedElements = this.elements.filter(el => el.isSelected);
      selectedElements.forEach(el => el.version++); // ★バージョンアップ
    }

    this.transformManager.onReleased();

    // ドラッグや変形操作が行われていた場合のみ保存
    if (wasTransforming) {
      // ★追加: 実際に動かしたので、Pressedで保存しておいた「動く前の状態」を履歴スタックに追加
      if (this._tempUndoState) {
        this.history.push(this._tempUndoState);

        // 履歴制限（30個）を超えたら古いのを捨てる（saveStateと同じロジック）
        if (this.history.length > 30) {
          this.history.shift();
        }
      }

      this.saveLocal(); // ★オートセーブ
    }

    // ★追加: 一時保存をクリア
    this._tempUndoState = null;
  }

  handleKeyPressed(e) {
    // 入力フィールドがフォーカスされている場合は何もしない
    if (e.target && e.target.tagName === 'INPUT') {
      return;
    }

    // Cmd(Mac) または Ctrl(Windows) + Z で元に戻す
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }

    // Cmd(Mac) または Ctrl(Windows) + C でコピー
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      e.preventDefault();
      this.copySelected();
      return;
    }

    // Cmd(Mac) または Ctrl(Windows) + V でペースト
    if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      e.preventDefault();
      this.pasteClipboard();
      return;
    }

    // BACKSPACE/DELETE で削除
    if (e.keyCode === 8 || e.keyCode === 46) { // 8: BACKSPACE, 46: DELETE
      e.preventDefault();
      this.deleteSelected();
      return;
    }
  }

  handleFileDrop(file, mx, my) {
    if (file.type === 'image') {
      // ファイル名から拡張子を取得
      const fileName = file.name || '';
      const isSVG = fileName.toLowerCase().endsWith('.svg');

      if (isSVG) {
        // SVGファイルをテキストとして読み込む
        fetch(file.data)
          .then(res => res.text())
          .then(text => {
            this.addVector(mx, my, text);
          })
          .catch(err => {
            console.error('SVG load error:', err);
          });
      } else {
        // 通常の画像ファイル
        loadImage(file.data, (loadedImg) => {
          this.addImage(mx, my, loadedImg);
        });
      }
    }
  }

  // --- リアクティブシステム（監視・自動更新） ---

  // ★魔法のメソッド: 指定した名前またはタグの要素が変わったら、actionを実行する
  bind(nameOrTag, action) {
    // 監視リストになければ作る
    if (!this.observers) this.observers = [];

    // 監視データを登録
    this.observers.push({
      nameOrTag: nameOrTag,
      action: action,
      lastVersions: {} // 各要素のバージョンを記憶（タグ対応のためオブジェクトに変更）
    });
  }

  // ★draw()内で毎回呼ぶ監視ループ
  update() {
    if (!this.observers) return;

    for (let obs of this.observers) {
      // IDまたはタグで要素を取得
      const targets = this._resolveTargets(obs.nameOrTag);

      for (let target of targets) {
        // 要素の一意なキーを生成（IDがあればID、なければ配列のインデックス）
        const key = target.name || this.elements.indexOf(target);
        const lastVersion = obs.lastVersions[key] || -1;

        // バージョンが変わっていたらアクションを実行！
        if (target.version !== lastVersion) {
          obs.action(target);
          obs.lastVersions[key] = target.version; // 最新バージョンを記憶
        }
      }
    }
  }

  // ★p5.jsのdrawループをフックして、勝手に update() が走るようにする
  _enableAutoUpdate() {
    // 学生が sketch.js に書いた draw 関数を一度退避させる
    const studentDraw = window.draw;

    // draw 関数を上書きする
    window.draw = () => {
      // 1. まずシステム側の更新チェックを回す（これで system.update() が不要になる）
      this.update();

      // 2. その後、学生が書いた draw の中身を実行する
      if (studentDraw) {
        studentDraw();
      } else {
        // もし学生が draw を書いてない場合でも、最低限 render はする（保険）
        background(this.backgroundColor);
        this.render();
      }
    };
  }
}
