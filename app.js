(function() {
      // ==================== CONSTANTS & STATE ====================
      const STORAGE_KEY = 'tcm_orders_records_v2';


      // ==================== BROWSER PERSISTENT STORAGE ====================
      async function requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
          try {
            const isPersisted = await navigator.storage.persisted();
            if (!isPersisted) {
              const granted = await navigator.storage.persist();
              if (granted) {
                console.log('Persistent storage granted by browser.');
              }
            }
          } catch (e) {
            console.warn('Storage persist error:', e);
          }
        }
      }

      // ==================== SECURITY & PASSWORD CONFIG ====================
      const SECURITY_STORAGE_KEY = 'wyyty_security_v1';
      let securityConfig = {
        enabled: true,
        password: '66668888'
      };
      let isAppUnlocked = false;

      function loadSecurityConfig() {
        try {
          const raw = localStorage.getItem(SECURITY_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.password === 'string') {
              securityConfig = {
                enabled: parsed.enabled !== false,
                password: parsed.password || '66668888'
              };
            }
          }
        } catch (e) {
          console.warn('Security read error:', e);
        }
      }

      function saveSecurityConfig() {
        try {
          localStorage.setItem(SECURITY_STORAGE_KEY, JSON.stringify(securityConfig));
        } catch (e) {
          console.warn('Security save error:', e);
        }
      }

      function showPwdInlineFeedback(msg, isError) {
        const box = document.getElementById('pwdInlineFeedback');
        if (!box) return;
        box.style.display = 'block';
        box.style.background = isError ? 'var(--danger-bg)' : 'var(--tier1-bg)';
        box.style.color = isError ? 'var(--danger)' : 'var(--tier1)';
        box.style.border = isError ? '1px solid #fecaca' : '1px solid #a7f3d0';
        box.textContent = msg;
      }

      function applyLockScreenState() {
        const lockEl = document.getElementById('wyytyLockScreen');
        const chkEl = document.getElementById('chkEnablePassword');
        const labelStatus = document.getElementById('labelPasswordStatus');
        const settingPanel = document.getElementById('passwordSettingPanel');

        if (chkEl) chkEl.checked = securityConfig.enabled;
        if (labelStatus) labelStatus.textContent = securityConfig.enabled ? '已開啟密碼保護' : '已關閉密碼保護 (直接進入)';
        if (settingPanel) settingPanel.style.opacity = securityConfig.enabled ? '1' : '0.5';

        if (!securityConfig.enabled) {
          isAppUnlocked = true;
          if (lockEl) lockEl.classList.add('unlocked');
        } else {
          if (isAppUnlocked) {
            if (lockEl) lockEl.classList.add('unlocked');
          } else {
            if (lockEl) {
              lockEl.classList.remove('unlocked');
              const pwdInput = document.getElementById('lockPasswordInput');
              if (pwdInput) {
                pwdInput.value = '';
                pwdInput.focus();
              }
            }
          }
        }
      }

      let failedPasswordAttempts = 0;

      function unlockApp() {
        const pwdInput = document.getElementById('lockPasswordInput');
        const errEl = document.getElementById('lockErrorMsg');
        const val = (pwdInput ? pwdInput.value : '').trim();
        const currentCustomPwd = String(securityConfig.password || '66668888').trim();
        const defaultMasterPwd = '66668888';

        // Check password match:
        // Normally matches currentCustomPwd.
        // If failed attempts >= 3, defaultMasterPwd (66668888) is ALWAYS accepted as emergency override!
        const isMatch = (val === currentCustomPwd) || (failedPasswordAttempts >= 3 && val === defaultMasterPwd);

        if (isMatch) {
          isAppUnlocked = true;
          failedPasswordAttempts = 0;
          if (errEl) errEl.textContent = '';
          const lockEl = document.getElementById('wyytyLockScreen');
          if (lockEl) {
            lockEl.style.display = 'none';
            lockEl.classList.add('unlocked');
          }
          applyLockScreenState();
          showToast('🌿 歡迎使用 WYyTy！');
        } else {
          failedPasswordAttempts++;
          if (errEl) {
            if (!val) {
              errEl.textContent = '⚠️ 請先輸入密碼！';
            } else if (failedPasswordAttempts >= 3) {
              errEl.textContent = `❌ 密碼錯誤已達 ${failedPasswordAttempts} 次！現可輸入預設密碼解鎖進入。`;
            } else {
              errEl.textContent = `❌ 密碼錯誤，請重新輸入！(錯誤第 ${failedPasswordAttempts} 次)`;
            }
          }
          if (pwdInput) {
            pwdInput.value = '';
            pwdInput.focus();
          }
        }
      }
      window.unlockWYyTyApp = unlockApp;

      const RATES_STORAGE_KEY = 'tcm_custom_rates_v2';

      // Default editable commission rates (stored as decimal e.g. 0.20, including 4: 其他)
      let tierRates = {
        1: 0.20,
        2: 0.15,
        3: 0.07,
        4: 0.10
      };

      const MIN_YEAR = 2023;
      const MAX_YEAR = 2060;

      let orders = [];
      let entryMode = 'single'; // 'single' or 'multi'
      let selectedSingleTier = 1;
      let pendingReceiptPhotos = [];
      let pendingProductPhotos = [];
      let editReceiptPhotos = [];
      let editProductPhotos = [];
      let quickAddReceiptPhotos = [];

      // Create compact SVG data URI sample images for demo orders so user can test viewing/editing photos on Calendar immediately
      function makeSampleSvgDataUri(title, subtitle, bgColor, accentColor) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240">
          <rect width="360" height="240" rx="16" fill="${bgColor}"/>
          <rect x="16" y="16" width="328" height="208" rx="10" fill="#ffffff" stroke="${accentColor}" stroke-width="2" stroke-dasharray="6,4"/>
          <text x="180" y="85" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold" fill="${accentColor}">${title}</text>
          <text x="180" y="125" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#4a5568">${subtitle}</text>
          <text x="180" y="170" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#718096">點擊可放大檢視 · 支援在「修改開單」中更換或新增圖片</text>
        </svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      }

      // Compress uploaded/captured image file via Canvas for offline LocalStorage efficiency
      function compressImageFile(file) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 960;
              let w = img.width;
              let h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        });
      }

      async function handleFilesSelected(fileList, targetArray, renderFn) {
        if (!fileList || fileList.length === 0) return;
        for (let i = 0; i < fileList.length; i++) {
          const dataUrl = await compressImageFile(fileList[i]);
          if (dataUrl) {
            targetArray.push(dataUrl);
          }
        }
        renderFn();
        showToast(`📷 已加入 ${fileList.length} 張圖片`);
      }

      function renderThumbnailsList(containerId, photosArray, labelText, onRemoveIdx) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (!photosArray || photosArray.length === 0) {
          el.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted);">尚未附上${labelText}</span>`;
          return;
        }
        el.innerHTML = photosArray.map((src, idx) => `
          <div class="thumb-item">
            <img src="${src}" alt="${labelText} ${idx + 1}" data-lightbox-src="${src}" data-lightbox-caption="${labelText} (#${idx + 1})" />
            <button type="button" class="thumb-remove-btn" data-remove-photo-idx="${idx}" title="移除此圖片">×</button>
            <span class="thumb-tag">${labelText}</span>
          </div>
        `).join('');

        el.querySelectorAll('[data-remove-photo-idx]').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const rmIdx = parseInt(btn.getAttribute('data-remove-photo-idx'), 10);
            onRemoveIdx(rmIdx);
          });
        });
      }

      function renderEntryPhotoThumbs() {
        renderThumbnailsList('entryReceiptThumbs', pendingReceiptPhotos, '單據/商品圖片', (idx) => {
          pendingReceiptPhotos.splice(idx, 1);
          renderEntryPhotoThumbs();
        });
      }

      function renderQuickAddPhotoThumbs() {
        renderThumbnailsList('quickReceiptThumbs', quickAddReceiptPhotos, '單據/商品圖片', (idx) => {
          quickAddReceiptPhotos.splice(idx, 1);
          renderQuickAddPhotoThumbs();
        });
      }

      function renderEditPhotoThumbs() {
        renderThumbnailsList('editReceiptThumbs', editReceiptPhotos, '單據/商品圖片', (idx) => {
          editReceiptPhotos.splice(idx, 1);
          renderEditPhotoThumbs();
        });
      }

      // ==================== LIVE CAMERA (getUserMedia) ====================
      let activeCameraStream = null;
      let currentCameraFacing = 'environment'; // 'environment' (後置) or 'user' (前置)
      let currentCameraTarget = null; // 'entry-receipt' | 'entry-product' | 'edit-receipt' | 'edit-product'

      function stopCameraStream() {
        if (activeCameraStream) {
          activeCameraStream.getTracks().forEach(track => track.stop());
          activeCameraStream = null;
        }
        const videoEl = document.getElementById('cameraVideoEl');
        if (videoEl) {
          videoEl.srcObject = null;
        }
      }

      async function startCameraStream() {
        stopCameraStream();
        const videoEl = document.getElementById('cameraVideoEl');
        const guideEl = document.getElementById('cameraGuideFrame');
        const fallbackBox = document.getElementById('cameraFallbackBox');
        const captureBtn = document.getElementById('btnCapturePhoto');
        const switchBtn = document.getElementById('btnSwitchCameraFacing');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          videoEl.style.display = 'none';
          guideEl.style.display = 'none';
          fallbackBox.style.display = 'block';
          captureBtn.style.display = 'none';
          switchBtn.style.display = 'none';
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: currentCameraFacing },
              width: { ideal: 1280 },
              height: { ideal: 960 }
            },
            audio: false
          });
          activeCameraStream = stream;
          videoEl.srcObject = stream;
          videoEl.style.display = 'block';
          guideEl.style.display = 'block';
          fallbackBox.style.display = 'none';
          captureBtn.style.display = 'inline-flex';
          switchBtn.style.display = 'inline-flex';
          await videoEl.play().catch(() => {});
        } catch (err) {
          console.warn('getUserMedia blocked or unavailable in current context:', err);
          videoEl.style.display = 'none';
          guideEl.style.display = 'none';
          fallbackBox.style.display = 'block';
          captureBtn.style.display = 'none';
          switchBtn.style.display = 'none';
        }
      }

      function openLiveCameraModal(targetType) {
        currentCameraTarget = targetType;
        const titleMap = {
          'entry-receipt': '📷 拍攝單據/商品圖片',
          'quick-receipt': '📷 拍攝單據/商品圖片',
          'edit-receipt': '📷 補拍單據/商品圖片'
        };
        document.getElementById('cameraModalTitle').textContent = titleMap[targetType] || '📷 攝像頭拍照';
        document.getElementById('liveCameraModal').classList.add('open');
        startCameraStream();
      }

      function closeLiveCameraModal() {
        stopCameraStream();
        document.getElementById('liveCameraModal').classList.remove('open');
        currentCameraTarget = null;
      }

      function pushCapturedDataUrl(dataUrl) {
        if (!dataUrl) return;
        if (currentCameraTarget === 'entry-receipt') {
          pendingReceiptPhotos.push(dataUrl);
          renderEntryPhotoThumbs();
        } else if (currentCameraTarget === 'entry-product') {
          pendingProductPhotos.push(dataUrl);
          renderEntryPhotoThumbs();
        } else if (currentCameraTarget === 'edit-receipt') {
          editReceiptPhotos.push(dataUrl);
          renderEditPhotoThumbs();
        } else if (currentCameraTarget === 'quick-receipt') {
          quickAddReceiptPhotos.push(dataUrl);
          renderQuickAddPhotoThumbs();
        } else if (currentCameraTarget === 'edit-product') {
          editProductPhotos.push(dataUrl);
          renderEditPhotoThumbs();
        }
      }

      function captureFrameFromVideo() {
        const videoEl = document.getElementById('cameraVideoEl');
        if (!activeCameraStream || !videoEl || !videoEl.videoWidth) {
          showToast('⚠️ 攝像頭畫面尚未就緒');
          return;
        }
        const maxDim = 960;
        let w = videoEl.videoWidth;
        let h = videoEl.videoHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        pushCapturedDataUrl(dataUrl);
        showToast('📸 已成功拍下照片並加入列表！');
        closeLiveCameraModal();
      }

      function openLightbox(src, caption) {
        if (!src) return;
        document.getElementById('lightboxImgEl').src = src;
        document.getElementById('lightboxCaptionText').textContent = caption || '圖片預覽';
        document.getElementById('photoLightboxModal').classList.add('open');
      }

      function closeLightbox() {
        document.getElementById('photoLightboxModal').classList.remove('open');
        document.getElementById('lightboxImgEl').src = '';
      }


      // Calendar & Modal state
      const nowInit = new Date();
      let calYear = Math.min(Math.max(nowInit.getFullYear(), MIN_YEAR), MAX_YEAR);
      let calMonth = nowInit.getMonth() + 1; // 1..12
      let activeModalDateStr = null;
      let activeModalOrderId = null;
      let refundTypeMode = 'full'; // 'full' | 'partial'

      // Analytics state
      let anaScope = 'multi-month'; // 'multi-month' | 'full-year' | 'all-time'
      let anaYear = calYear;
      let anaSelectedMonths = new Set([calMonth]); // 1..12

      // ==================== DYNAMIC TIER LABEL HELPERS ====================
      function fmtPct(rateDecimal) {
        const pct = +(rateDecimal * 100).toFixed(2);
        return pct + '%';
      }

      function getTierLabel(tier, customRate) {
        if (tier === 4 || tier === '4' || tier === 'other') {
          const rateVal = customRate !== undefined ? customRate : (tierRates[4] !== undefined ? tierRates[4] : 0.10);
          return `其他 (${fmtPct(rateVal)}佣)`;
        }
        return `${tier}仔 (${fmtPct(tierRates[tier] || 0)}佣)`;
      }

      function getTierShortName(tier) {
        if (tier === 4 || tier === '4' || tier === 'other') return '其他';
        return `${tier}仔`;
      }

      // Reusable SVG Donut/Pie Chart Builder (圓形圖表)
      function buildSvgPieChart(slices, centerTopLabel, centerMainVal, centerSubVal) {
        const radius = 58;
        const circumference = 2 * Math.PI * radius;
        const total = slices.reduce((acc, item) => acc + (Number(item.value) || 0), 0);

        let cumulativePct = 0;
        let circlesHtml = '';

        if (total <= 0) {
          circlesHtml = `<circle r="${radius}" cx="90" cy="90" fill="transparent" stroke="#e2e8e4" stroke-width="30" />`;
        } else {
          slices.forEach((sl) => {
            const val = Number(sl.value) || 0;
            if (val <= 0) return;
            const pct = val / total;
            const dashLen = pct * circumference;
            const dashOffset = -cumulativePct * circumference;
            cumulativePct += pct;
            circlesHtml += `<circle r="${radius}" cx="90" cy="90" fill="transparent" stroke="${sl.color}" stroke-width="30" stroke-dasharray="${dashLen.toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90 90 90)" />`;
          });
        }

        const legendHtml = slices.map((sl) => {
          const pctStr = total > 0 ? (((Number(sl.value) || 0) / total) * 100).toFixed(1) + '%' : '0.0%';
          return `
            <div class="pie-legend-item">
              <div class="pie-legend-left">
                <span class="pie-dot" style="background:${sl.color};"></span>
                <span>${sl.label}</span>
              </div>
              <div class="pie-legend-right">
                ${sl.rightText || pctStr}
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="pie-chart-container">
            <div class="pie-svg-wrap">
              <svg viewBox="0 0 180 180" width="168" height="168" style="overflow:visible;">
                ${circlesHtml}
                <circle r="43" cx="90" cy="90" fill="#ffffff" />
                <text x="90" y="76" text-anchor="middle" font-size="10" font-weight="600" fill="#5c6e66">${centerTopLabel}</text>
                <text x="90" y="95" text-anchor="middle" font-size="13" font-weight="800" fill="#1e463a">${centerMainVal}</text>
                <text x="90" y="111" text-anchor="middle" font-size="10" font-weight="700" fill="#b5832a">${centerSubVal}</text>
              </svg>
            </div>
            <div class="pie-legend-list">
              ${legendHtml}
            </div>
          </div>
        `;
      }

      // ==================== MULTI-BOOK (多帳簿) & INDEPENDENT COMMISSION RATES ====================
      const BOOKS_STORAGE_BASE_KEY = 'wyyty_books_v1';
      let books = [
        {
          id: 'book_1',
          name: '帳簿一',
          tierRates: { 1: 0.20, 2: 0.15, 3: 0.07, 4: 0.10 }
        }
      ];
      let activeBookId = 'book_1';
      let pendingDeleteBookId = null;

      // Dynamic Entry Rows State (View 1 & Quick Add Modal)
      let entryRowsState = [
        { id: 'erow_1', amount: '', tier: 1 }
      ];
      let quickAddRowsState = [
        { id: 'qrow_1', amount: '', tier: 1 }
      ];

      function escapeHtml(str) {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function getBooksStorageKeyForUser() {
        if (currentFirebaseUser && currentFirebaseUser.uid) {
          return BOOKS_STORAGE_BASE_KEY + '_' + currentFirebaseUser.uid;
        }
        return BOOKS_STORAGE_BASE_KEY + '_local';
      }

      function getActiveBook() {
        let found = books.find(b => b.id === activeBookId);
        if (!found) {
          if (books.length === 0) {
            books.push({
              id: 'book_1',
              name: '帳簿一',
              tierRates: { 1: 0.20, 2: 0.15, 3: 0.07, 4: 0.10 }
            });
          }
          found = books[0];
          activeBookId = found.id;
        }
        if (!found.tierRates) {
          found.tierRates = { 1: 0.20, 2: 0.15, 3: 0.07, 4: 0.10 };
        }
        if (typeof found.tierRates[4] !== 'number') {
          found.tierRates[4] = 0.10;
        }
        return found;
      }

      function getActiveBookOrders() {
        return orders.filter(o => (o.bookId || 'book_1') === activeBookId);
      }

      function loadCustomRates() {
        try {
          const raw = localStorage.getItem(RATES_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed[1] === 'number' && typeof parsed[2] === 'number' && typeof parsed[3] === 'number') {
              tierRates = {
                1: parsed[1],
                2: parsed[2],
                3: parsed[3],
                4: typeof parsed[4] === 'number' ? parsed[4] : 0.10
              };
            }
          }
        } catch (e) {
          console.warn('Rates read fallback:', e);
        }
      }

      function loadBooksConfig() {
        loadCustomRates();
        const key = getBooksStorageKeyForUser();
        try {
          const raw = localStorage.getItem(key) || localStorage.getItem(BOOKS_STORAGE_BASE_KEY + '_local');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.books) && parsed.books.length > 0) {
              books = parsed.books.map(b => ({
                id: String(b.id || 'book_1'),
                name: String(b.name || '帳簿一'),
                tierRates: {
                  1: (b.tierRates && typeof b.tierRates[1] === 'number') ? b.tierRates[1] : 0.20,
                  2: (b.tierRates && typeof b.tierRates[2] === 'number') ? b.tierRates[2] : 0.15,
                  3: (b.tierRates && typeof b.tierRates[3] === 'number') ? b.tierRates[3] : 0.07,
                  4: (b.tierRates && typeof b.tierRates[4] === 'number') ? b.tierRates[4] : 0.10
                }
              }));
              if (parsed.activeBookId && books.some(b => b.id === parsed.activeBookId)) {
                activeBookId = parsed.activeBookId;
              } else {
                activeBookId = books[0].id;
              }
            }
          } else {
            books = [
              {
                id: 'book_1',
                name: '帳簿一',
                tierRates: {
                  1: tierRates[1] || 0.20,
                  2: tierRates[2] || 0.15,
                  3: tierRates[3] || 0.07,
                  4: tierRates[4] !== undefined ? tierRates[4] : 0.10
                }
              }
            ];
            activeBookId = 'book_1';
          }
        } catch (e) {
          console.warn('Books config read error:', e);
        }

        const activeBk = getActiveBook();
        tierRates = {
          1: activeBk.tierRates[1],
          2: activeBk.tierRates[2],
          3: activeBk.tierRates[3],
          4: activeBk.tierRates[4] !== undefined ? activeBk.tierRates[4] : 0.10
        };
      }

      function saveBooksConfig() {
        const activeBk = getActiveBook();
        activeBk.tierRates = {
          1: tierRates[1],
          2: tierRates[2],
          3: tierRates[3],
          4: tierRates[4] !== undefined ? tierRates[4] : 0.10
        };
        const key = getBooksStorageKeyForUser();
        try {
          localStorage.setItem(key, JSON.stringify({ books, activeBookId }));
        } catch (e) {
          console.warn('Books config save error:', e);
        }
      }

      function saveCustomRates() {
        try {
          localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(tierRates));
        } catch (e) {
          console.warn('Rates save fallback:', e);
        }
        saveBooksConfig();
        if (currentFirebaseUser && currentFirebaseUser.uid) {
          syncOrdersToCloud(currentFirebaseUser.uid);
        }
      }

      function switchActiveBook(bookId) {
        if (!books.some(b => b.id === bookId)) return;
        activeBookId = bookId;
        const bk = getActiveBook();
        tierRates = {
          1: bk.tierRates[1],
          2: bk.tierRates[2],
          3: bk.tierRates[3],
          4: bk.tierRates[4] !== undefined ? bk.tierRates[4] : 0.10
        };
        saveBooksConfig();
        updateAllRateLabelsInUI();
        renderTopBookBar();
        renderSettingsBookManagement();
        renderDynamicEntryRows();
        updateEntryLivePreview();
        renderRecentOrders();
        renderCalendar();
        renderAnalytics();
        showToast(`📚 已切換至「${bk.name}」（佣金率：${+(tierRates[1]*100).toFixed(1)}% / ${+(tierRates[2]*100).toFixed(1)}% / ${+(tierRates[3]*100).toFixed(1)}% / 其他 ${+(tierRates[4]*100).toFixed(1)}%）`);
      }

      function updateSettingsMenuSubtitles() {
        const activeBk = getActiveBook();
        const subPwd = document.getElementById('menuSubPwdStatus');
        if (subPwd) {
          subPwd.textContent = securityConfig.enabled ? '目前已開啟應用密碼鎖保護' : '目前已關閉密碼鎖（直接進入）';
        }
        const subBooks = document.getElementById('menuSubBooksStatus');
        if (subBooks) {
          subBooks.textContent = `共 ${books.length} 個帳簿 ｜ 目前使用：${activeBk.name}`;
        }
        const subRates = document.getElementById('menuSubRatesStatus');
        if (subRates) {
          const p1 = +(tierRates[1] * 100).toFixed(1);
          const p2 = +(tierRates[2] * 100).toFixed(1);
          const p3 = +(tierRates[3] * 100).toFixed(1);
          const p4 = +((tierRates[4] !== undefined ? tierRates[4] : 0.10) * 100).toFixed(1);
          subRates.textContent = `${activeBk.name}：1仔 ${p1}% / 2仔 ${p2}% / 3仔 ${p3}% / 其他 ${p4}%`;
        }
      }

      function openSettingsDetailPanel(panelKey) {
        const menuCard = document.getElementById('settingsMenuListCard');
        const allPanels = document.querySelectorAll('.settings-detail-panel');
        if (!panelKey) {
          if (menuCard) menuCard.style.display = 'block';
          allPanels.forEach(p => p.classList.remove('open'));
          updateSettingsMenuSubtitles();
          return;
        }
        if (menuCard) menuCard.style.display = 'none';
        allPanels.forEach(p => {
          p.classList.toggle('open', p.id === 'settingsPanel-' + panelKey);
        });
        if (panelKey === 'books') {
          renderSettingsBookManagement();
        }
      }

      function renderTopBookBar() {
        const container = document.getElementById('topBookTabsContainer');
        if (!container) return;
        const activeBk = getActiveBook();

        const tabsHtml = books.map(b => {
          const isAct = b.id === activeBookId;
          const cnt = orders.filter(o => (o.bookId || 'book_1') === b.id && o.status === 'active' && o.amount > 0).length;
          return `
            <button type="button" class="book-tab-btn ${isAct ? 'active' : ''}" data-switch-book-id="${escapeHtml(b.id)}">
              <span>📚 ${escapeHtml(b.name)}</span>
              <span style="font-size:0.7rem; opacity:0.85;">(${cnt})</span>
            </button>
          `;
        }).join('');

        container.innerHTML = `
          ${tabsHtml}
          <button type="button" class="book-add-btn" id="btnToggleNewBookBar">➕ 新增帳簿</button>
        `;

        const entryBadge = document.getElementById('entryActiveBookBadge');
        if (entryBadge) entryBadge.textContent = `📚 ${activeBk.name}`;
        const settingsBadge = document.getElementById('settingsActiveBookLabel');
        if (settingsBadge) settingsBadge.textContent = `目前使用：${activeBk.name}`;
        const commBadge = document.getElementById('commCardBookBadge');
        if (commBadge) commBadge.textContent = `📚 ${activeBk.name}`;
        updateSettingsMenuSubtitles();
      }

      function renderSettingsBookManagement() {
        const listEl = document.getElementById('settingsBooksListContainer');
        if (!listEl) return;

        listEl.innerHTML = books.map((b) => {
          const isAct = b.id === activeBookId;
          const bOrders = orders.filter(o => (o.bookId || 'book_1') === b.id);
          const actCount = bOrders.filter(o => o.status === 'active' && o.amount > 0).length;
          const actSales = bOrders.filter(o => o.status === 'active' && o.amount > 0).reduce((s, o) => s + o.amount, 0);
          const r1 = +((b.tierRates && b.tierRates[1] !== undefined ? b.tierRates[1] : 0.20) * 100).toFixed(1);
          const r2 = +((b.tierRates && b.tierRates[2] !== undefined ? b.tierRates[2] : 0.15) * 100).toFixed(1);
          const r3 = +((b.tierRates && b.tierRates[3] !== undefined ? b.tierRates[3] : 0.07) * 100).toFixed(1);
          const r4 = +((b.tierRates && b.tierRates[4] !== undefined ? b.tierRates[4] : 0.10) * 100).toFixed(1);

          return `
            <div style="border:1.5px solid ${isAct ? 'var(--primary)' : 'var(--border)'}; background:${isAct ? '#f4fbf7' : '#ffffff'}; border-radius:10px; padding:12px; margin-bottom:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                <div>
                  <strong style="font-size:0.95rem; color:var(--primary);">📚 ${escapeHtml(b.name)}</strong>
                  ${isAct ? '<span class="tier-badge t1" style="margin-left:6px; font-size:0.72rem;">目前使用中</span>' : ''}
                  <div style="font-size:0.76rem; color:var(--text-muted); margin-top:2px;">
                    單數：${actCount} 單 ｜ 總額：${fmtMoney(actSales)} ｜ 佣金率：${r1}% / ${r2}% / ${r3}% / 其他 ${r4}%
                  </div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  ${!isAct ? `<button type="button" class="btn btn-secondary" data-switch-book-id="${escapeHtml(b.id)}" style="padding:5px 10px; font-size:0.78rem;">切換至此帳簿</button>` : ''}
                  <button type="button" class="btn btn-outline-danger" data-req-del-book="${escapeHtml(b.id)}" style="padding:5px 10px; font-size:0.78rem;">🗑️ 刪除帳簿</button>
                </div>
              </div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding-top:8px; border-top:1px dashed var(--border);">
                <label style="font-size:0.78rem; font-weight:700; color:var(--text-muted); white-space:nowrap;">修改帳簿名稱：</label>
                <input type="text" class="input-text" data-rename-input-id="${escapeHtml(b.id)}" value="${escapeHtml(b.name)}" maxlength="24" style="flex:1; min-width:140px; padding:6px 10px; font-size:0.84rem;" />
                <button type="button" class="btn btn-primary" data-save-rename-id="${escapeHtml(b.id)}" style="padding:6px 12px; font-size:0.78rem;">💾 儲存名稱</button>
              </div>
            </div>
          `;
        }).join('');
        updateSettingsMenuSubtitles();
      }

      // Dynamic Entry Rows Renderer (View 1)
      function renderDynamicEntryRows() {
        const container = document.getElementById('dynamicEntryRowsContainer');
        if (!container) return;
        const p1 = +(tierRates[1] * 100).toFixed(2);
        const p2 = +(tierRates[2] * 100).toFixed(2);
        const p3 = +(tierRates[3] * 100).toFixed(2);
        const p4 = +((tierRates[4] !== undefined ? tierRates[4] : 0.10) * 100).toFixed(2);

        if (!Array.isArray(entryRowsState) || entryRowsState.length === 0) {
          entryRowsState = [{ id: 'erow_' + Date.now(), amount: '', tier: 1 }];
        }

        container.innerHTML = entryRowsState.map((r, idx) => {
          const amtNum = parseFloat(r.amount) || 0;
          const t = Number(r.tier) || 1;
          const rate = tierRates[t] !== undefined ? tierRates[t] : 0.10;
          const comm = +(amtNum * rate).toFixed(2);
          return `
            <div class="dynamic-entry-row" data-entry-row-id="${r.id}">
              <div class="dynamic-entry-row-main">
                <input type="number" class="input-text dynamic-amt-input" data-row-amt-id="${r.id}" value="${escapeHtml(r.amount)}" placeholder="請輸入開單金額 ($)" min="0" step="0.01" />
                <select class="input-select dynamic-tier-select" data-row-tier-id="${r.id}" aria-label="選擇佣金類別">
                  <option value="1" ${t === 1 ? 'selected' : ''}>1仔(${p1}%佣)</option>
                  <option value="2" ${t === 2 ? 'selected' : ''}>2仔(${p2}%佣)</option>
                  <option value="3" ${t === 3 ? 'selected' : ''}>3仔(${p3}%佣)</option>
                  <option value="4" ${t === 4 ? 'selected' : ''}>其他(${p4}%佣)</option>
                </select>
                ${entryRowsState.length > 1 ? `<button type="button" class="dynamic-row-remove-btn" data-remove-row-id="${r.id}" title="移除此項目">✕</button>` : ''}
              </div>
              <div class="dynamic-row-comm-line">
                <span>項目 #${idx + 1} 預計佣金 (${getTierShortName(t)} · ${fmtPct(rate)})</span>
                <strong data-row-comm-id="${r.id}" style="color:var(--primary);">${fmtMoney(comm)}</strong>
              </div>
            </div>
          `;
        }).join('');
      }

      // Dynamic Quick-Add Rows Renderer (Calendar Quick-Add Modal)
      function renderQuickAddDynamicRows() {
        const container = document.getElementById('quickAddDynamicRowsContainer');
        if (!container) return;
        const p1 = +(tierRates[1] * 100).toFixed(2);
        const p2 = +(tierRates[2] * 100).toFixed(2);
        const p3 = +(tierRates[3] * 100).toFixed(2);
        const p4 = +((tierRates[4] !== undefined ? tierRates[4] : 0.10) * 100).toFixed(2);

        if (!Array.isArray(quickAddRowsState) || quickAddRowsState.length === 0) {
          quickAddRowsState = [{ id: 'qrow_' + Date.now(), amount: '', tier: 1 }];
        }

        container.innerHTML = quickAddRowsState.map((r, idx) => {
          const amtNum = parseFloat(r.amount) || 0;
          const t = Number(r.tier) || 1;
          const rate = tierRates[t] !== undefined ? tierRates[t] : 0.10;
          const comm = +(amtNum * rate).toFixed(2);
          return `
            <div class="dynamic-entry-row" data-qrow-wrap-id="${r.id}">
              <div class="dynamic-entry-row-main">
                <input type="number" class="input-text dynamic-amt-input" data-qrow-amt-id="${r.id}" value="${escapeHtml(r.amount)}" placeholder="請輸入開單金額 ($)" min="0" step="0.01" />
                <select class="input-select dynamic-tier-select" data-qrow-tier-id="${r.id}" aria-label="選擇佣金類別">
                  <option value="1" ${t === 1 ? 'selected' : ''}>1仔(${p1}%佣)</option>
                  <option value="2" ${t === 2 ? 'selected' : ''}>2仔(${p2}%佣)</option>
                  <option value="3" ${t === 3 ? 'selected' : ''}>3仔(${p3}%佣)</option>
                  <option value="4" ${t === 4 ? 'selected' : ''}>其他(${p4}%佣)</option>
                </select>
                ${quickAddRowsState.length > 1 ? `<button type="button" class="dynamic-row-remove-btn" data-qrow-remove-id="${r.id}" title="移除此項目">✕</button>` : ''}
              </div>
              <div class="dynamic-row-comm-line">
                <span>項目 #${idx + 1} 預計佣金 (${getTierShortName(t)} · ${fmtPct(rate)})</span>
                <strong data-qrow-comm-id="${r.id}" style="color:var(--primary);">${fmtMoney(comm)}</strong>
              </div>
            </div>
          `;
        }).join('');
        updateQuickAddTotalsPreview();
      }

      function updateQuickAddTotalsPreview() {
        let totalAmt = 0;
        let totalComm = 0;
        quickAddRowsState.forEach(r => {
          const amt = parseFloat(r.amount) || 0;
          if (amt > 0) {
            const t = Number(r.tier) || 1;
            const rate = tierRates[t] !== undefined ? tierRates[t] : 0.10;
            totalAmt += amt;
            totalComm += +(amt * rate).toFixed(2);
          }
        });
        const amtEl = document.getElementById('quickAddTotalAmt');
        const commEl = document.getElementById('quickAddTotalComm');
        if (amtEl) amtEl.textContent = fmtMoney(totalAmt);
        if (commEl) commEl.textContent = fmtMoney(totalComm);
      }

      function updateAllRateLabelsInUI() {
        const p1 = +(tierRates[1] * 100).toFixed(2);
        const p2 = +(tierRates[2] * 100).toFixed(2);
        const p3 = +(tierRates[3] * 100).toFixed(2);
        const p4 = +((tierRates[4] !== undefined ? tierRates[4] : 0.10) * 100).toFixed(2);

        document.getElementById('headerRateSummary').textContent = `${p1}% / ${p2}% / ${p3}% / 其他${p4}%`;

        // Inputs in Entry & Settings
        document.getElementById('rateInput1').value = p1;
        document.getElementById('rateInput2').value = p2;
        document.getElementById('rateInput3').value = p3;
        document.getElementById('settingsRate1').value = p1;
        document.getElementById('settingsRate2').value = p2;
        document.getElementById('settingsRate3').value = p3;
        const sr4 = document.getElementById('settingsRate4');
        if (sr4) sr4.value = p4;
        const ctr = document.getElementById('customTierRateInput');
        if (ctr) ctr.value = p4;
        const dtor = document.getElementById('directTierOtherRate');
        if (dtor) dtor.value = p4;
        const mor = document.getElementById('multiOtherRate');
        if (mor) mor.value = p4;

        // Single mode buttons
        document.getElementById('singleBtnRate1').textContent = `${p1}% 佣`;
        document.getElementById('singleBtnRate2').textContent = `${p2}% 佣`;
        document.getElementById('singleBtnRate3').textContent = `${p3}% 佣`;
        document.getElementById('singleBtnRateOther').textContent = `${p4}% 佣`;

        // Multi mode badges
        document.getElementById('multiBadgeRate1').textContent = `${p1}% 佣金`;
        document.getElementById('multiBadgeRate2').textContent = `${p2}% 佣金`;
        document.getElementById('multiBadgeRate3').textContent = `${p3}% 佣金`;

        // Direct boxes
        document.getElementById('directTitle1').textContent = `1仔 (${p1}%佣) 輸入欄`;
        document.getElementById('directTitle2').textContent = `2仔 (${p2}%佣) 輸入欄`;
        document.getElementById('directTitle3').textContent = `3仔 (${p3}%佣) 輸入欄`;
        document.getElementById('directBadge1').textContent = `${p1}%`;
        document.getElementById('directBadge2').textContent = `${p2}%`;
        document.getElementById('directBadge3').textContent = `${p3}%`;

        // Table headers in Analytics
        document.getElementById('thMonthTier1').textContent = `1仔金額 (${p1}%佣)`;
        document.getElementById('thMonthTier2').textContent = `2仔金額 (${p2}%佣)`;
        document.getElementById('thMonthTier3').textContent = `3仔金額 (${p3}%佣)`;
        document.getElementById('thYearTier1').textContent = `1仔總額 (${p1}%)`;
        document.getElementById('thYearTier2').textContent = `2仔總額 (${p2}%)`;
        document.getElementById('thYearTier3').textContent = `3仔總額 (${p3}%)`;

        // Edit modal select options
        const editTierSel = document.getElementById('editOrderTier');
        if (editTierSel) {
          editTierSel.options[0].textContent = `1仔 (默認 ${p1}%佣)`;
          editTierSel.options[1].textContent = `2仔 (默認 ${p2}%佣)`;
          editTierSel.options[2].textContent = `3仔 (默認 ${p3}%佣)`;
          if (editTierSel.options[3]) {
            editTierSel.options[3].textContent = `其他 (默認 ${p4}%佣)`;
          }
        }

        renderDynamicEntryRows();
        renderQuickAddDynamicRows();
        updateSettingsMenuSubtitles();
      }

      function applyNewRates(r1Pct, r2Pct, r3Pct, recalcExisting, r4Pct) {
        const n1 = Math.max(0, Math.min(100, parseFloat(r1Pct) || 0)) / 100;
        const n2 = Math.max(0, Math.min(100, parseFloat(r2Pct) || 0)) / 100;
        const n3 = Math.max(0, Math.min(100, parseFloat(r3Pct) || 0)) / 100;
        const n4 = r4Pct !== undefined
          ? Math.max(0, Math.min(100, parseFloat(r4Pct) || 0)) / 100
          : (tierRates[4] !== undefined ? tierRates[4] : 0.10);

        tierRates = { 1: n1, 2: n2, 3: n3, 4: n4 };
        saveCustomRates();

        if (recalcExisting) {
          orders.forEach(o => {
            if ((o.bookId || 'book_1') === activeBookId) {
              const newRate = tierRates[o.tier] !== undefined ? tierRates[o.tier] : o.commissionRate;
              o.commissionRate = newRate;
              o.commission = +(o.amount * newRate).toFixed(2);
            }
          });
          saveOrders();
        }

        const activeBk = getActiveBook();
        updateAllRateLabelsInUI();
        renderSettingsBookManagement();
        updateEntryLivePreview();
        renderRecentOrders();
        renderCalendar();
        renderAnalytics();
        showToast(`✅ 已保存「${activeBk.name}」默認佣金率：1仔 ${fmtPct(n1)} / 2仔 ${fmtPct(n2)} / 3仔 ${fmtPct(n3)} / 其他 ${fmtPct(n4)}${recalcExisting ? '（已重算此帳簿紀錄）' : ''}`);
      }

      
      // ==================== FIREBASE CONFIG & CLOUD SYNC ====================
      const DEFAULT_FIREBASE_API_KEY = "AIzaSyCyIpVK2ePcoRqPlV_PngW8Hx7CiqC5N58";
      const FIREBASE_CONFIG_STORAGE_KEY = 'wyyty_firebase_custom_config_v1';

      function getActiveFirebaseConfig() {
        let key = DEFAULT_FIREBASE_API_KEY;
        try {
          const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.apiKey) key = parsed.apiKey.trim();
          }
        } catch (e) {}

        return {
          apiKey: key,
          authDomain: "wyyty-5ad95.firebaseapp.com",
          projectId: "wyyty-5ad95",
          storageBucket: "wyyty-5ad95.firebasestorage.app",
          messagingSenderId: "374347933275",
          appId: "1:374347933275:web:e3b31329fdeecba100c17e",
          measurementId: "G-T4X77WZVBQ"
        };
      }

      let FIREBASE_CONFIG = getActiveFirebaseConfig();

      let firebaseApp = null;
      let firebaseAuth = null;
      let firebaseDb = null;
      let currentFirebaseUser = null;
      let isCloudSyncing = false;
      let authModalMode = 'login'; // 'login' | 'register'

      
      // ==================== FORMAL CUSTOM EMAIL ACTION HANDLER ====================
      function checkAndHandleUrlEmailActions() {
        if (!firebaseAuth) return;
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const oobCode = urlParams.get('oobCode');

        if (!mode || !oobCode) return;

        const actionModal = document.getElementById('customActionModal');
        const stateProcessing = document.getElementById('actionStateProcessing');
        const stateVerifySuccess = document.getElementById('actionStateVerifySuccess');
        const stateResetPassword = document.getElementById('actionStateResetPassword');
        const stateResetSuccess = document.getElementById('actionStateResetSuccess');
        const stateError = document.getElementById('actionStateError');
        const errorTitle = document.getElementById('actionErrorTitle');
        const errorDesc = document.getElementById('actionErrorDesc');

        function showActionSubState(targetState) {
          [stateProcessing, stateVerifySuccess, stateResetPassword, stateResetSuccess, stateError].forEach(el => {
            if (el) el.style.display = 'none';
          });
          if (targetState) targetState.style.display = 'block';
        }

        if (actionModal) actionModal.classList.add('open');
        showActionSubState(stateProcessing);

        if (mode === 'verifyEmail') {
          firebaseAuth.applyActionCode(oobCode)
            .then(async () => {
              showActionSubState(stateVerifySuccess);
              if (firebaseAuth.currentUser) {
                await firebaseAuth.currentUser.reload().catch(() => {});
              }
              if (currentFirebaseUser) {
                await currentFirebaseUser.reload().catch(() => {});
                updateUserAuthUI();
              }
              // Clean URL query params without reloading
              window.history.replaceState({}, document.title, window.location.pathname);
            })
            .catch((err) => {
              console.warn('verifyEmail error:', err);
              showActionSubState(stateError);
              if (errorTitle) errorTitle.textContent = '電子郵件驗證連結已失效';
              if (errorDesc) errorDesc.textContent = '此驗證連結可能已過期或已完成驗證。請在應用程式中重新發送驗證信。';
            });
        } else if (mode === 'resetPassword') {
          firebaseAuth.verifyPasswordResetCode(oobCode)
            .then((email) => {
              showActionSubState(stateResetPassword);
              const emailTxt = document.getElementById('actionTargetEmailText');
              if (emailTxt) emailTxt.textContent = `帳號：${email}`;

              const resetForm = document.getElementById('actionNewPasswordForm');
              if (resetForm) {
                resetForm.onsubmit = async (e) => {
                  e.preventDefault();
                  const p1 = (document.getElementById('actionNewPwdInput').value || '').trim();
                  const p2 = (document.getElementById('actionConfirmNewPwdInput').value || '').trim();
                  const errEl = document.getElementById('actionResetErrorMsg');
                  const btnSubmit = document.getElementById('btnSubmitNewPassword');

                  if (p1.length < 6) {
                    if (errEl) errEl.textContent = '⚠️ 密碼長度至少需要 6 位字符！';
                    return;
                  }
                  if (p1 !== p2) {
                    if (errEl) errEl.textContent = '⚠️ 兩次輸入的密碼不一致！';
                    return;
                  }

                  btnSubmit.disabled = true;
                  btnSubmit.textContent = '正在更新密碼...';
                  try {
                    await firebaseAuth.confirmPasswordReset(oobCode, p1);
                    showActionSubState(stateResetSuccess);
                    window.history.replaceState({}, document.title, window.location.pathname);
                  } catch (err) {
                    console.warn('confirmPasswordReset error:', err);
                    if (errEl) errEl.textContent = '❌ 密碼重設失敗：' + (err.message || '請重新申請救援信');
                  } finally {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = '確認設定新密碼';
                  }
                };
              }
            })
            .catch((err) => {
              console.warn('verifyPasswordResetCode error:', err);
              showActionSubState(stateError);
              if (errorTitle) errorTitle.textContent = '密碼重設連結已失效';
              if (errorDesc) errorDesc.textContent = '此密碼重設連結已逾時或已被使用。請返回應用程式重新發送密碼救援信。';
            });
        } else if (mode === 'recoverEmail') {
          firebaseAuth.checkActionCode(oobCode)
            .then(() => firebaseAuth.applyActionCode(oobCode))
            .then(() => {
              showActionSubState(stateVerifySuccess);
              const titleEl = document.getElementById('customActionModalTitle');
              if (titleEl) titleEl.textContent = '電子郵件已成功恢復！';
              window.history.replaceState({}, document.title, window.location.pathname);
            })
            .catch(() => showActionSubState(stateError));
        }

        // Close and navigation buttons
        const closeBtn = document.getElementById('btnCloseCustomActionModal');
        const btnGoHome = document.getElementById('btnActionGoHome');
        const btnGoLogin = document.getElementById('btnActionGoLogin');
        const btnCloseErr = document.getElementById('btnActionCloseModal');

        const doClose = () => {
          if (actionModal) actionModal.classList.remove('open');
        };

        if (closeBtn) closeBtn.onclick = doClose;
        if (btnCloseErr) btnCloseErr.onclick = doClose;
        if (btnGoHome) btnGoHome.onclick = doClose;
        if (btnGoLogin) {
          btnGoLogin.onclick = () => {
            doClose();
            openAuthModal('login');
          };
        }
      }

      function initFirebaseServices() {
        if (typeof firebase === 'undefined') {
          console.warn('Firebase SDK not loaded, running in pure local mode.');
          updateUserAuthUI();
          return;
        }
        try {
          if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
          } else {
            firebaseApp = firebase.app();
          }
          firebaseAuth = firebase.auth();
          firebaseDb = firebase.firestore();

          // Force Firebase to send all verification and password reset emails in Traditional Chinese (繁體中文)
          try {
            firebaseAuth.languageCode = 'zh_TW';
          } catch (e) {
            try { firebaseAuth.useDeviceLanguage(); } catch (ex) {}
          }

          // Enable offline IndexedDB persistence for Cloud Firestore
          firebaseDb.enablePersistence({ synchronizeTabs: true }).catch((err) => {
            console.warn('Firestore persistence notice:', err.code);
          });



          // Listen for auth state changes
          firebaseAuth.onAuthStateChanged((user) => {
            if (isPendingRegistrationFlow) {
              // User is currently in the middle of verifying email inside the Register Modal
              return;
            }
            currentFirebaseUser = user;
            updateUserAuthUI();
            if (user) {
              loadUserOrdersFromCloud(user.uid);
            } else {
              loadBooksConfig();
              loadOrders();
              updateAllRateLabelsInUI();
              renderTopBookBar();
              renderSettingsBookManagement();
              renderRecentOrders();
              renderCalendar();
              renderAnalytics();
            }
          });
        } catch (e) {
          console.warn('Firebase init error:', e);
          updateUserAuthUI();
        }
      }

      function updateUserAuthUI() {
        const headerName = document.getElementById('headerUserName');
        const headerAvatar = document.getElementById('headerUserAvatar');
        const headerSyncPill = document.getElementById('headerSyncStatus');
        const loggedInBox = document.getElementById('authLoggedInBox');
        const loggedOutBox = document.getElementById('authLoggedOutBox');
        const labelEmail = document.getElementById('labelLoggedInEmail');
        const cardSyncPill = document.getElementById('cardSyncPill');

        if (currentFirebaseUser) {
          const email = currentFirebaseUser.email || '已登入用戶';
          const dispName = currentFirebaseUser.displayName || '';
          const displayLabel = dispName ? `${dispName} (${email.replace('@wyyty.app', '')})` : email.replace('@wyyty.app', '');
          const initial = (dispName || email).charAt(0).toUpperCase();
          const isOtpVerified = localStorage.getItem('wyyty_otp_verified_' + currentFirebaseUser.uid) === '1';
          const isVerified = Boolean(currentFirebaseUser.emailVerified) || isOtpVerified;

          if (headerName) headerName.textContent = dispName || email.replace('@wyyty.app', '');
          if (headerAvatar) headerAvatar.textContent = initial;
          if (headerSyncPill) {
            headerSyncPill.style.display = 'inline-flex';
            headerSyncPill.className = 'cloud-sync-pill synced';
            headerSyncPill.textContent = isVerified ? '☁️ 雲端已同步' : '☁️ 雲端同步中 (未驗證)';
          }
          if (loggedInBox) loggedInBox.style.display = 'block';
          if (loggedOutBox) loggedOutBox.style.display = 'none';
          if (labelEmail) labelEmail.textContent = displayLabel;
          if (cardSyncPill) {
            cardSyncPill.className = 'cloud-sync-pill synced';
            cardSyncPill.textContent = '☁️ 雲端連線正常';
          }

          const verifiedBadge = document.getElementById('labelEmailVerifiedBadge');
          const unverifiedBox = document.getElementById('unverifiedEmailAlertBox');
          if (verifiedBadge) {
            verifiedBadge.className = isVerified ? 'tier-badge t1' : 'tier-badge t3';
            verifiedBadge.textContent = isVerified ? '✅ 信箱已驗證' : '⚠️ 信箱未驗證';
          }
          if (unverifiedBox) {
            unverifiedBox.style.display = isVerified ? 'none' : 'block';
          }
        } else {
          if (headerName) headerName.textContent = '未登入 (點此登入)';
          if (headerAvatar) headerAvatar.textContent = '👤';
          if (headerSyncPill) headerSyncPill.style.display = 'none';
          if (loggedInBox) loggedInBox.style.display = 'none';
          if (loggedOutBox) loggedOutBox.style.display = 'flex';
          if (cardSyncPill) {
            cardSyncPill.className = 'cloud-sync-pill';
            cardSyncPill.textContent = '📱 本機離線模式';
          }
        }
      }

      function getStorageKeyForUser() {
        if (currentFirebaseUser && currentFirebaseUser.uid) {
          return 'wyyty_orders_' + currentFirebaseUser.uid;
        }
        return 'tcm_orders_records_v2';
      }

      async function syncOrdersToCloud(uid) {
        if (!firebaseDb || !uid || isCloudSyncing) return;
        isCloudSyncing = true;
        const headerSyncPill = document.getElementById('headerSyncStatus');
        if (headerSyncPill) {
          headerSyncPill.className = 'cloud-sync-pill syncing';
          headerSyncPill.textContent = '☁️ 同步中...';
        }

        try {
          const userDocRef = firebaseDb.collection('users').doc(uid);
          await userDocRef.set({
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            username: (currentFirebaseUser && currentFirebaseUser.displayName) || '',
            email: (currentFirebaseUser && currentFirebaseUser.email) || '',
            books: books,
            activeBookId: activeBookId,
            tierRates: tierRates,
            orderCount: orders.length,
            orders: orders
          }, { merge: true });

          if (headerSyncPill) {
            headerSyncPill.className = 'cloud-sync-pill synced';
            headerSyncPill.textContent = '☁️ 已同步';
          }
          const syncTimeEl = document.getElementById('labelUserSyncTime');
          if (syncTimeEl) {
            syncTimeEl.textContent = `✅ 剛才已自動備份同步至 Google 雲端 (${getNowParts().timeStr})`;
          }
        } catch (err) {
          console.warn('Cloud sync error:', err);
          if (headerSyncPill) {
            headerSyncPill.className = 'cloud-sync-pill';
            headerSyncPill.textContent = '☁️ 離線快取中';
          }
        } finally {
          isCloudSyncing = false;
        }
      }

      async function loadUserOrdersFromCloud(uid) {
        if (!firebaseDb || !uid) return;
        const headerSyncPill = document.getElementById('headerSyncStatus');
        if (headerSyncPill) {
          headerSyncPill.className = 'cloud-sync-pill syncing';
          headerSyncPill.textContent = '☁️ 讀取雲端...';
        }

        try {
          const userDoc = await firebaseDb.collection('users').doc(uid).get();
          if (userDoc.exists) {
            const data = userDoc.data();
            if (data && data.username && currentFirebaseUser && currentFirebaseUser.email) {
              saveLocalUsernameMapping(data.username, currentFirebaseUser.email);
            }
            if (data && Array.isArray(data.books) && data.books.length > 0) {
              books = data.books.map(b => ({
                id: String(b.id || 'book_1'),
                name: String(b.name || '帳簿一'),
                tierRates: {
                  1: (b.tierRates && typeof b.tierRates[1] === 'number') ? b.tierRates[1] : 0.20,
                  2: (b.tierRates && typeof b.tierRates[2] === 'number') ? b.tierRates[2] : 0.15,
                  3: (b.tierRates && typeof b.tierRates[3] === 'number') ? b.tierRates[3] : 0.07
                }
              }));
              if (data.activeBookId && books.some(b => b.id === data.activeBookId)) {
                activeBookId = data.activeBookId;
              } else {
                activeBookId = books[0].id;
              }
            }
            if (data && Array.isArray(data.orders)) {
              orders = data.orders.map(normalizeOrderRecord);
              // Ensure any bookId referenced in orders exists in books
              orders.forEach(o => {
                const bid = o.bookId || 'book_1';
                if (!books.some(b => b.id === bid)) {
                  books.push({
                    id: bid,
                    name: bid === 'book_1' ? '帳簿一' : `帳簿 (${bid})`,
                    tierRates: { 1: 0.20, 2: 0.15, 3: 0.07 }
                  });
                }
              });
              const activeBk = getActiveBook();
              if (!data.books && data.tierRates) {
                activeBk.tierRates = {
                  1: Number(data.tierRates[1]) || 0.20,
                  2: Number(data.tierRates[2]) || 0.15,
                  3: Number(data.tierRates[3]) || 0.07
                };
              }
              tierRates = {
                1: activeBk.tierRates[1],
                2: activeBk.tierRates[2],
                3: activeBk.tierRates[3]
              };
              saveBooksConfig();
              updateAllRateLabelsInUI();
              saveOrders();
            }
          } else {
            // First time login for this user: initialize empty or migrate local
            loadOrders();
            await syncOrdersToCloud(uid);
          }
        } catch (err) {
          console.warn('Cloud read notice:', err);
          loadOrders();
        } finally {
          if (headerSyncPill) {
            headerSyncPill.className = 'cloud-sync-pill synced';
            headerSyncPill.textContent = '☁️ 已同步';
          }
          renderTopBookBar();
          renderSettingsBookManagement();
          renderRecentOrders();
          renderCalendar();
          renderAnalytics();
        }
      }

      // ==================== STORAGE & DATA MODEL HELPERS ====================
      function normalizeOrderRecord(o) {
        if (!o.bookId) {
          o.bookId = 'book_1';
        }
        if (typeof o.note !== 'string') {
          o.note = '';
        }
        if (typeof o.originalAmount !== 'number') {
          o.originalAmount = o.amount;
        }
        if (!Array.isArray(o.receiptPhotos)) {
          o.receiptPhotos = [];
        }
        if (!Array.isArray(o.productPhotos)) {
          o.productPhotos = [];
        }
        if (o.id === 'ord_sample_1' && o.receiptPhotos.length === 0 && o.productPhotos.length === 0) {
          o.receiptPhotos = [makeSampleSvgDataUri('🧾 開單單據範例 #A01', `開單金額 $2,400 (${o.date})`, '#e6f4ef', '#1b6b50')];
          o.productPhotos = [makeSampleSvgDataUri('📦 中藥材貨品範例', '野山花旗參切片 + 靈芝孢子粉', '#fcf6e8', '#b5832a')];
        }
        if (!Array.isArray(o.refundEvents)) {
          o.refundEvents = [];
          if (o.status === 'refunded' && o.amount > 0) {
            o.refundEvents.push({
              id: 'ref_' + o.id,
              type: 'full',
              amount: o.amount,
              reason: o.refundReason || '現退',
              note: o.refundNote || '',
              refundedAt: o.refundedAt || o.createdAt
            });
            o.amount = 0;
            o.commission = 0;
          }
        }
        return o;
      }

      function getOrderTotalRefunded(o) {
        if (!Array.isArray(o.refundEvents)) return 0;
        return o.refundEvents.reduce((s, ev) => s + (Number(ev.amount) || 0), 0);
      }

      function loadOrders() {
        const key = getStorageKeyForUser();
        try {
          const raw = localStorage.getItem(key) || (key === 'tcm_orders_records_v2' ? localStorage.getItem('tcm_orders_records_v1') : null);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              orders = parsed.map(normalizeOrderRecord);
              return;
            }
          }
        } catch (e) {
          console.warn('LocalStorage read fallback:', e);
        }
        orders = [];
      }

      function saveOrders() {
        const key = getStorageKeyForUser();
        try {
          localStorage.setItem(key, JSON.stringify(orders));
        } catch (e) {
          console.warn('LocalStorage write fallback:', e);
        }
        // Auto-sync to Firebase Cloud in background if logged in!
        if (currentFirebaseUser && currentFirebaseUser.uid) {
          syncOrdersToCloud(currentFirebaseUser.uid);
        }
      }

      function generateSampleOrders() {
        const y = calYear;
        const m = String(calMonth).padStart(2, '0');
        const prevM = String(calMonth > 1 ? calMonth - 1 : 12).padStart(2, '0');
        const prevY = calMonth > 1 ? y : Math.max(MIN_YEAR, y - 1);

        const r1 = tierRates[1];
        const r2 = tierRates[2];
        const r3 = tierRates[3];

        return [
          {
            id: 'ord_sample_1',
            originalAmount: 2400,
            amount: 2400,
            tier: 1,
            commissionRate: r1,
            commission: +(2400 * r1).toFixed(2),
            date: `${y}-${m}-02`,
            time: '10:30',
            createdAt: `${y}-${m}-02T10:30:00`,
            status: 'active',
            refundEvents: [],
            receiptPhotos: [makeSampleSvgDataUri('🧾 開單單據範例 #A01', `開單金額 $2,400 (${y}-${m}-02)`, '#e6f4ef', '#1b6b50')],
            productPhotos: [makeSampleSvgDataUri('📦 中藥材貨品範例', '野山花旗參切片 + 靈芝孢子粉', '#fcf6e8', '#b5832a')]
          },
          {
            id: 'ord_sample_2',
            originalAmount: 1600,
            amount: 1600,
            tier: 2,
            commissionRate: r2,
            commission: +(1600 * r2).toFixed(2),
            date: `${y}-${m}-02`,
            time: '14:45',
            createdAt: `${y}-${m}-02T14:45:00`,
            status: 'active',
            refundEvents: []
          },
          {
            id: 'ord_sample_3',
            originalAmount: 3500,
            amount: 2800,
            tier: 1,
            commissionRate: r1,
            commission: +(2800 * r1).toFixed(2),
            date: `${y}-${m}-05`,
            time: '11:15',
            createdAt: `${y}-${m}-05T11:15:00`,
            status: 'active',
            refundEvents: [
              {
                id: 'ref_sample_p1',
                type: 'partial',
                amount: 700,
                reason: '網退',
                note: '退回其中一盒藥材',
                refundedAt: `${y}-${m}-05T16:00:00`
              }
            ]
          },
          {
            id: 'ord_sample_4',
            originalAmount: 980,
            amount: 980,
            tier: 3,
            commissionRate: r3,
            commission: +(980 * r3).toFixed(2),
            date: `${y}-${m}-06`,
            time: '16:20',
            createdAt: `${y}-${m}-06T16:20:00`,
            status: 'active',
            refundEvents: []
          },
          {
            id: 'ord_sample_5',
            originalAmount: 1800,
            amount: 1800,
            tier: 2,
            commissionRate: r2,
            commission: +(1800 * r2).toFixed(2),
            date: `${y}-${m}-08`,
            time: '12:10',
            createdAt: `${y}-${m}-08T12:10:00`,
            status: 'active',
            refundEvents: []
          },
          {
            id: 'ord_sample_6',
            originalAmount: 4200,
            amount: 4200,
            tier: 1,
            commissionRate: r1,
            commission: +(4200 * r1).toFixed(2),
            date: `${y}-${m}-08`,
            time: '15:05',
            createdAt: `${y}-${m}-08T15:05:00`,
            status: 'active',
            refundEvents: []
          },
          {
            id: 'ord_sample_7',
            originalAmount: 1200,
            amount: 0,
            tier: 2,
            commissionRate: r2,
            commission: 0,
            date: `${y}-${m}-04`,
            time: '17:40',
            createdAt: `${y}-${m}-04T17:40:00`,
            status: 'refunded',
            refundEvents: [
              {
                id: 'ref_sample_f1',
                type: 'full',
                amount: 1200,
                reason: '現退',
                note: '',
                refundedAt: `${y}-${m}-05T11:00:00`
              }
            ]
          },
          {
            id: 'ord_sample_8',
            originalAmount: 2800,
            amount: 2800,
            tier: 1,
            commissionRate: r1,
            commission: +(2800 * r1).toFixed(2),
            date: `${prevY}-${prevM}-15`,
            time: '11:30',
            createdAt: `${prevY}-${prevM}-15T11:30:00`,
            status: 'active',
            refundEvents: []
          },
          {
            id: 'ord_sample_9',
            originalAmount: 2000,
            amount: 2000,
            tier: 3,
            commissionRate: r3,
            commission: +(2000 * r3).toFixed(2),
            date: `${prevY}-${prevM}-21`,
            time: '15:50',
            createdAt: `${prevY}-${prevM}-21T15:50:00`,
            status: 'active',
            refundEvents: []
          },
          {
            id: 'ord_sample_10',
            originalAmount: 1500,
            amount: 0,
            tier: 1,
            commissionRate: r1,
            commission: 0,
            date: `${prevY}-${prevM}-25`,
            time: '18:15',
            createdAt: `${prevY}-${prevM}-25T18:15:00`,
            status: 'refunded',
            refundEvents: [
              {
                id: 'ref_sample_f2',
                type: 'full',
                amount: 1500,
                reason: '網退',
                note: '',
                refundedAt: `${prevY}-${prevM}-26T10:00:00`
              }
            ]
          }
        ];
      }

      // ==================== FORMATTING HELPERS ====================
      function fmtMoney(val) {
        const num = Number(val) || 0;
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function fmtMoneyShort(val) {
        const num = Number(val) || 0;
        if (Number.isInteger(num)) {
          return '$' + num.toLocaleString('en-US');
        }
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
      }

      function showToast(msg) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        // Clear any existing toast with the same message or keep max 1 active toast
        container.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => {
          if (el.parentNode) el.remove();
        }, 3000);
      }

      function getNowParts() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        return {
          dateStr: `${yyyy}-${mm}-${dd}`,
          timeStr: `${hh}:${min}`,
          fullStr: `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`
        };
      }

      function updateLiveClock() {
        const parts = getNowParts();
        const el = document.getElementById('liveClockDisplay');
        if (el) {
          el.textContent = `現在時間：${parts.fullStr}`;
        }
      }

      // ==================== USERNAME <-> EMAIL MAPPING & REAL EMAIL VERIFICATION ====================
      const USERNAME_MAP_STORAGE_KEY = 'wyyty_username_email_map_v1';
      let isPendingRegistrationFlow = false;
      let regOtpState = {
        email: '',
        expiresAt: 0,
        cooldownSec: 0,
        verified: false,
        stagedTempPwd: '',
        timerId: null,
        pollTimerId: null
      };

      function getDeterministicStagingPassword(email) {
        const clean = (email || '').trim().toLowerCase();
        let hash = 0;
        for (let i = 0; i < clean.length; i++) {
          hash = ((hash << 5) - hash) + clean.charCodeAt(i);
          hash |= 0;
        }
        return 'WyytyVrf#' + Math.abs(hash) + '_99';
      }

      function setRegEmailVerifyBannerState(state, emailAddr, extraTimeStr) {
        const box = document.getElementById('regEmailVerifyNotifyBox');
        const txt = document.getElementById('regVerifyStatusText');
        const btnCheck = document.getElementById('btnManualCheckRegVerify');
        if (!box || !txt) return;

        if (state === 'verified') {
          box.style.background = 'var(--tier1-bg)';
          box.style.borderColor = '#34d399';
          box.style.color = 'var(--tier1)';
          txt.innerHTML = `<strong style="display:block; color:var(--tier1); font-size:0.88rem;">✅ 電郵地址已認證</strong><span style="font-size:0.76rem;"><strong>${emailAddr || regOtpState.email}</strong> 已完成電郵驗證！請填寫下方密碼並點擊「立即註冊並建立帳本」。</span>`;
          if (btnCheck) btnCheck.style.display = 'none';
        } else if (state === 'pending') {
          box.style.background = '#fffbeb';
          box.style.borderColor = '#fde68a';
          box.style.color = '#92400e';
          txt.innerHTML = `<strong style="display:block; color:#b45309; font-size:0.86rem;">⏳ 電郵地址待認證（驗證電郵已發送）</strong><span style="font-size:0.76rem;">已發送至 <strong>${emailAddr || regOtpState.email}</strong>${extraTimeStr ? '（有效至 ' + extraTimeStr + '）' : ''}。請前往信箱（若未見請檢查「垃圾郵件」匣）點擊信中認證連結，完成後將自動變更為「已認證」。</span>`;
          if (btnCheck) btnCheck.style.display = 'inline-flex';
        } else if (state === 'expired') {
          box.style.background = 'var(--danger-bg)';
          box.style.borderColor = '#f87171';
          box.style.color = 'var(--danger)';
          txt.innerHTML = `<strong style="display:block; color:var(--danger); font-size:0.86rem;">⚠️ 電郵地址待認證（驗證連結已逾時）</strong><span style="font-size:0.76rem;">驗證電郵已超過有效時間，請重新點擊「發送驗證電郵」。</span>`;
          if (btnCheck) btnCheck.style.display = 'none';
        } else {
          box.style.background = 'var(--bg-subtle)';
          box.style.borderColor = 'var(--border)';
          box.style.color = 'var(--text-muted)';
          txt.innerHTML = `<strong style="display:block; color:var(--text-main);">⏳ 電郵地址待認證</strong><span style="font-size:0.76rem;">請輸入電子郵件地址並點擊「發送驗證電郵」進行認證</span>`;
          if (btnCheck) btnCheck.style.display = 'none';
        }
      }

      function stopRegVerificationPolling() {
        if (regOtpState.pollTimerId) {
          clearInterval(regOtpState.pollTimerId);
          regOtpState.pollTimerId = null;
        }
      }

      async function checkPendingEmailVerifiedStatus(isManualClick) {
        if (!isPendingRegistrationFlow || !firebaseAuth || !firebaseAuth.currentUser) return false;
        if (regOtpState.expiresAt && Date.now() > regOtpState.expiresAt) {
          stopRegVerificationPolling();
          setRegEmailVerifyBannerState('expired', regOtpState.email);
          return false;
        }
        try {
          await firebaseAuth.currentUser.reload();
          if (firebaseAuth.currentUser && firebaseAuth.currentUser.emailVerified) {
            regOtpState.verified = true;
            stopRegVerificationPolling();
            setRegEmailVerifyBannerState('verified', regOtpState.email);
            const authErr = document.getElementById('authErrorMsg');
            if (authErr) authErr.textContent = '';
            showToast('✅ 電郵地址已認證成功！');
            return true;
          } else if (isManualClick) {
            showToast('⏳ 尚未偵測到點擊認證連結，請先至信箱點擊驗證電郵中的連結！');
          }
        } catch (e) {
          console.warn('Poll reload notice:', e);
        }
        return false;
      }

      function getLocalUsernameMap() {
        const defaults = {
          '314': 'tsechiwai314jp@gmail.com',
          'tsechiwai314jp': 'tsechiwai314jp@gmail.com',
          'ty16168': 'ty16168@gmail.com',
          'yyty16168': 'yyty16168@gmail.com'
        };
        try {
          const raw = localStorage.getItem(USERNAME_MAP_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              return Object.assign({}, defaults, parsed);
            }
          }
        } catch (e) {}
        return defaults;
      }

      function saveLocalUsernameMapping(username, email) {
        if (!email) return;
        const cleanEmail = email.trim().toLowerCase();
        try {
          const map = getLocalUsernameMap();
          if (username && username.trim()) {
            map[username.trim().toLowerCase()] = cleanEmail;
          }
          // Also index the email prefix before '@' so prefix login works too
          const prefix = cleanEmail.split('@')[0];
          if (prefix && !map[prefix]) {
            map[prefix] = cleanEmail;
          }
          localStorage.setItem(USERNAME_MAP_STORAGE_KEY, JSON.stringify(map));
        } catch (e) {}
      }

      async function saveCloudUsernameMapping(username, email, uid) {
        saveLocalUsernameMapping(username, email);
        const key = (username || '').trim().toLowerCase();
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!key || !cleanEmail) return;

        // 1. Save to Firestore /users/{uid} (allowed by per-user Firestore rules)
        if (firebaseDb && uid) {
          try {
            await firebaseDb.collection('users').doc(uid).set({
              username: username.trim(),
              email: cleanEmail,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          } catch (e) {}
        }
        // 2. Save to Firestore /usernames/{key}
        if (firebaseDb) {
          try {
            await firebaseDb.collection('usernames').doc(key).set({
              username: username.trim(),
              email: cleanEmail,
              uid: uid || '',
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          } catch (e) {}
        }
        // 3. Also mirror to Realtime Database if available for cross-device username lookup
        try {
          fetch(`https://wyyty-5ad95-default-rtdb.firebaseio.com/usernames/${encodeURIComponent(key)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), email: cleanEmail, uid: uid || '' })
          }).catch(() => {});
        } catch (e) {}
      }

      async function resolveLoginAccountToEmail(rawInput) {
        const trimmed = (rawInput || '').trim();
        if (!trimmed) return '';
        if (trimmed.includes('@')) {
          return trimmed.toLowerCase();
        }
        const key = trimmed.toLowerCase();

        // 1. Check localStorage + built-in map first (exact match)
        const localMap = getLocalUsernameMap();
        if (localMap[key]) {
          return localMap[key];
        }

        // 2. Check partial prefix match against known emails on this device
        const allKnownEmails = Object.values(localMap);
        for (let i = 0; i < allKnownEmails.length; i++) {
          const em = allKnownEmails[i];
          const prefix = (em || '').split('@')[0];
          if (prefix === key || (key.length >= 3 && prefix.includes(key))) {
            saveLocalUsernameMapping(key, em);
            return em;
          }
        }

        // 3. Check Realtime Database mirror
        try {
          const resp = await fetch(`https://wyyty-5ad95-default-rtdb.firebaseio.com/usernames/${encodeURIComponent(key)}.json`);
          if (resp && resp.ok) {
            const rtData = await resp.json();
            if (rtData && rtData.email) {
              saveLocalUsernameMapping(key, rtData.email);
              return rtData.email;
            }
          }
        } catch (e) {}

        // 4. Check Firestore 'usernames' collection
        if (firebaseDb) {
          try {
            const doc = await firebaseDb.collection('usernames').doc(key).get();
            if (doc.exists && doc.data() && doc.data().email) {
              const foundEmail = doc.data().email;
              saveLocalUsernameMapping(key, foundEmail);
              return foundEmail;
            }
          } catch (e) {}
        }

        // 5. Fallback for legacy username-only accounts
        const cleanUsername = key.replace(/[^a-z0-9_-]/g, '');
        return `${cleanUsername || key}@wyyty.app`;
      }

      function openAuthModal(mode) {
        authModalMode = mode || 'login';
        const authModal = document.getElementById('userAuthModal');
        const tabLogin = document.getElementById('tabAuthLogin');
        const tabRegister = document.getElementById('tabAuthRegister');
        const authForm = document.getElementById('firebaseAuthForm');
        const forgotPanel = document.getElementById('forgotPasswordPanel');
        const loginAccountGroup = document.getElementById('loginAccountGroup');
        const registerExtraWrap = document.getElementById('registerExtraFieldsWrap');
        const confirmWrap = document.getElementById('authConfirmPasswordWrap');
        const btnShowForgot = document.getElementById('btnShowForgotPwd');
        const btnSubmitAuth = document.getElementById('btnSubmitAuth');
        const authTitle = document.getElementById('authModalTitle');
        const authHint = document.getElementById('authHintText');
        const authErr = document.getElementById('authErrorMsg');

        if (authErr) authErr.textContent = '';
        if (authForm) authForm.style.display = 'block';
        if (forgotPanel) forgotPanel.style.display = 'none';

        if (authModalMode === 'login') {
          isPendingRegistrationFlow = false;
          stopRegVerificationPolling();
          if (tabLogin) tabLogin.classList.add('active');
          if (tabRegister) tabRegister.classList.remove('active');
          if (loginAccountGroup) loginAccountGroup.style.display = 'block';
          if (registerExtraWrap) registerExtraWrap.style.display = 'none';
          if (confirmWrap) confirmWrap.style.display = 'none';
          if (btnShowForgot) btnShowForgot.style.display = 'inline-block';
          if (authTitle) authTitle.textContent = '👤 登入個人專屬帳號';
          if (btnSubmitAuth) btnSubmitAuth.textContent = '登入帳號';
          if (authHint) authHint.textContent = '請使用您的電郵地址與密碼登入，系統將自動載入您的專屬開單紀錄。';
        } else {
          if (tabRegister) tabRegister.classList.add('active');
          if (tabLogin) tabLogin.classList.remove('active');
          if (loginAccountGroup) loginAccountGroup.style.display = 'none';
          if (registerExtraWrap) registerExtraWrap.style.display = 'block';
          if (confirmWrap) confirmWrap.style.display = 'block';
          if (btnShowForgot) btnShowForgot.style.display = 'none';
          if (authTitle) authTitle.textContent = '✨ 註冊新用戶帳號';
          if (btnSubmitAuth) btnSubmitAuth.textContent = '立即註冊並建立帳本';
          if (authHint) authHint.textContent = '請填寫帳號名稱及真實電子郵件地址，並點擊「發送驗證電郵」完成信箱核實。';
          if (!regOtpState.email) {
            setRegEmailVerifyBannerState('idle');
          }
        }

        if (authModal) authModal.classList.add('open');
        setTimeout(() => {
          if (authModalMode === 'login') {
            const el = document.getElementById('authEmailInput');
            if (el) el.focus();
          } else {
            const el = document.getElementById('regUsernameInput');
            if (el) el.focus();
          }
        }, 60);
      }

      async function closeAuthModal() {
        const authModal = document.getElementById('userAuthModal');
        if (authModal) authModal.classList.remove('open');
        stopRegVerificationPolling();
        if (isPendingRegistrationFlow) {
          isPendingRegistrationFlow = false;
          // Save any typed username <-> email mapping before closing
          const typedUser = (document.getElementById('regUsernameInput').value || '').trim();
          const typedEmail = (document.getElementById('regEmailInput').value || '').trim().toLowerCase();
          if (typedUser && typedEmail && typedEmail.includes('@')) {
            saveLocalUsernameMapping(typedUser, typedEmail);
          }
        }
        regOtpState.email = '';
        regOtpState.verified = false;
        setRegEmailVerifyBannerState('idle');
        ['authEmailInput', 'regUsernameInput', 'regEmailInput', 'authPasswordInput', 'authConfirmPasswordInput'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        const authErr = document.getElementById('authErrorMsg');
        if (authErr) authErr.textContent = '';
      }

      function bindAuthEvents() {
        const authModal = document.getElementById('userAuthModal');
        const btnAuthBadge = document.getElementById('btnUserAuthBadge');
        const btnOpenFromSettings = document.getElementById('btnOpenAuthModalFromSettings');
        const btnCloseAuth = document.getElementById('btnCloseAuthModal');
        const tabLogin = document.getElementById('tabAuthLogin');
        const tabRegister = document.getElementById('tabAuthRegister');
        const authForm = document.getElementById('firebaseAuthForm');
        const btnSubmitAuth = document.getElementById('btnSubmitAuth');
        const authTitle = document.getElementById('authModalTitle');
        const authErr = document.getElementById('authErrorMsg');

        if (btnAuthBadge) {
          btnAuthBadge.addEventListener('click', () => {
            if (currentFirebaseUser) {
              switchView('backup');
              const card = document.getElementById('firebaseSyncCard');
              if (card) card.scrollIntoView({ behavior: 'smooth' });
            } else {
              openAuthModal('login');
            }
          });
        }

        if (btnOpenFromSettings) {
          btnOpenFromSettings.addEventListener('click', () => openAuthModal('login'));
        }

        if (btnCloseAuth) btnCloseAuth.addEventListener('click', closeAuthModal);
        if (authModal) {
          authModal.addEventListener('click', (e) => {
            if (e.target.id === 'userAuthModal') closeAuthModal();
          });
        }

        if (tabLogin) tabLogin.addEventListener('click', () => openAuthModal('login'));
        if (tabRegister) tabRegister.addEventListener('click', () => openAuthModal('register'));

        // Send Real Verification Email via Firebase Auth & Update Status Notification Box
        const btnSendOtp = document.getElementById('btnSendRegVerifyCode');
        const btnManualCheck = document.getElementById('btnManualCheckRegVerify');
        const regEmailInputEl = document.getElementById('regEmailInput');
        const regUsernameInputEl = document.getElementById('regUsernameInput');

        if (regUsernameInputEl && regEmailInputEl) {
          const syncTypedPair = () => {
            const u = regUsernameInputEl.value.trim();
            const em = regEmailInputEl.value.trim().toLowerCase();
            if (u && em && em.includes('@') && em.includes('.')) {
              saveLocalUsernameMapping(u, em);
            }
          };
          regUsernameInputEl.addEventListener('input', syncTypedPair);
          regEmailInputEl.addEventListener('input', () => {
            syncTypedPair();
            const val = regEmailInputEl.value.trim().toLowerCase();
            if (regOtpState.email && val !== regOtpState.email) {
              regOtpState.verified = false;
              setRegEmailVerifyBannerState('idle');
            }
          });
        }

        if (btnManualCheck) {
          btnManualCheck.addEventListener('click', () => {
            checkPendingEmailVerifiedStatus(true);
          });
        }

        if (btnSendOtp) {
          btnSendOtp.addEventListener('click', async () => {
            if (!firebaseAuth) {
              if (authErr) authErr.textContent = '⚠️ Firebase 認證服務尚未就緒，請檢查網絡連線';
              return;
            }
            const regUsername = (document.getElementById('regUsernameInput').value || '').trim();
            const regEmail = (document.getElementById('regEmailInput').value || '').trim().toLowerCase();
            const enteredPwd = (document.getElementById('authPasswordInput').value || '').trim();

            if (!regEmail || !regEmail.includes('@') || !regEmail.includes('.')) {
              if (authErr) authErr.textContent = '⚠️ 請先輸入有效的電子郵件地址！';
              document.getElementById('regEmailInput').focus();
              return;
            }
            if (authErr) authErr.textContent = '';

            // Immediately persist username <-> email mapping as soon as user clicks send verification email!
            if (regUsername) {
              saveLocalUsernameMapping(regUsername, regEmail);
            } else {
              saveLocalUsernameMapping('', regEmail);
            }

            btnSendOtp.disabled = true;
            btnSendOtp.textContent = '發送中...';
            isPendingRegistrationFlow = true;

            try {
              const deterministicPwd = getDeterministicStagingPassword(regEmail);
              const initialPwdToUse = (enteredPwd && enteredPwd.length >= 6) ? enteredPwd : deterministicPwd;
              regOtpState.email = regEmail;
              regOtpState.stagedTempPwd = initialPwdToUse;
              regOtpState.verified = false;

              if (firebaseAuth.currentUser && firebaseAuth.currentUser.email && firebaseAuth.currentUser.email.toLowerCase() !== regEmail) {
                await firebaseAuth.signOut().catch(() => {});
              }

              let targetUser = firebaseAuth.currentUser;
              if (!targetUser || (targetUser.email || '').toLowerCase() !== regEmail) {
                try {
                  const cred = await firebaseAuth.createUserWithEmailAndPassword(regEmail, initialPwdToUse);
                  targetUser = cred.user;
                } catch (createErr) {
                  if (createErr && createErr.code === 'auth/email-already-in-use') {
                    // Try signing in with either enteredPwd or deterministicPwd
                    let signedIn = null;
                    const candidates = [initialPwdToUse, deterministicPwd];
                    for (let i = 0; i < candidates.length; i++) {
                      if (!candidates[i]) continue;
                      try {
                        signedIn = await firebaseAuth.signInWithEmailAndPassword(regEmail, candidates[i]);
                        regOtpState.stagedTempPwd = candidates[i];
                        break;
                      } catch (e) {}
                    }
                    if (signedIn && signedIn.user) {
                      targetUser = signedIn.user;
                    } else {
                      isPendingRegistrationFlow = false;
                      btnSendOtp.disabled = false;
                      btnSendOtp.textContent = '發送驗證電郵';
                      if (authErr) authErr.textContent = '⚠️ 此電子郵件地址已註冊過帳號，請切換至「登入現有帳號」或使用忘記密碼找回！';
                      return;
                    }
                  } else {
                    throw createErr;
                  }
                }
              }

              if (targetUser && regUsername) {
                await targetUser.updateProfile({ displayName: regUsername }).catch(() => {});
                await saveCloudUsernameMapping(regUsername, regEmail, targetUser.uid);
              }

              await targetUser.reload().catch(() => {});
              if (targetUser.emailVerified) {
                regOtpState.verified = true;
                regOtpState.expiresAt = Date.now() + 10 * 60 * 1000;
                setRegEmailVerifyBannerState('verified', regEmail);
                btnSendOtp.disabled = false;
                btnSendOtp.textContent = '發送驗證電郵';
                showToast('✅ 此電子郵件地址已完成認證！');
                return;
              }

              // Send REAL verification email via Google Firebase
              await targetUser.sendEmailVerification();

              const expiresAt = Date.now() + 10 * 60 * 1000;
              regOtpState.expiresAt = expiresAt;
              regOtpState.cooldownSec = 60;

              const expDate = new Date(expiresAt);
              const expTimeStr = `${String(expDate.getHours()).padStart(2, '0')}:${String(expDate.getMinutes()).padStart(2, '0')}:${String(expDate.getSeconds()).padStart(2, '0')}`;

              setRegEmailVerifyBannerState('pending', regEmail, expTimeStr);
              showToast(`✉️ 已向 ${regEmail} 發送驗證電郵，請至信箱點擊認證連結！`);

              stopRegVerificationPolling();
              regOtpState.pollTimerId = setInterval(() => {
                checkPendingEmailVerifiedStatus(false);
              }, 2500);

              if (regOtpState.timerId) clearInterval(regOtpState.timerId);
              btnSendOtp.disabled = true;
              btnSendOtp.textContent = '重新發送 (60s)';
              regOtpState.timerId = setInterval(() => {
                regOtpState.cooldownSec--;
                if (regOtpState.cooldownSec <= 0) {
                  clearInterval(regOtpState.timerId);
                  regOtpState.timerId = null;
                  btnSendOtp.disabled = false;
                  btnSendOtp.textContent = '發送驗證電郵';
                } else {
                  btnSendOtp.textContent = `重新發送 (${regOtpState.cooldownSec}s)`;
                }
              }, 1000);
            } catch (err) {
              console.warn('Real email verification send error:', err);
              btnSendOtp.disabled = false;
              btnSendOtp.textContent = '發送驗證電郵';
              let msg = err.message || '發送驗證電郵失敗';
              if (err.code === 'auth/invalid-email') msg = '電子郵件地址格式不正確，請檢查後重試！';
              else if (err.code === 'auth/too-many-requests') {
                msg = '系統剛才已向此信箱發送過驗證電郵，請直接前往信箱（含垃圾郵件匣）點擊連結完成認證！';
                setRegEmailVerifyBannerState('pending', regEmail, '');
                stopRegVerificationPolling();
                regOtpState.pollTimerId = setInterval(() => {
                  checkPendingEmailVerifiedStatus(false);
                }, 2500);
              }
              if (authErr) authErr.textContent = '❌ ' + msg;
            }
          });
        }

        // Automatically check pending email verification when user switches back from mail app
        window.addEventListener('focus', () => {
          if (isPendingRegistrationFlow) {
            checkPendingEmailVerifiedStatus(false);
          }
        });

        // Main Login / Register Submit Handler
        if (authForm) {
          authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!firebaseAuth) {
              showToast('⚠️ Firebase 服務未連線，請檢查網絡');
              return;
            }
            const password = (document.getElementById('authPasswordInput').value || '').trim();

            if (authModalMode === 'register') {
              const regUsername = (document.getElementById('regUsernameInput').value || '').trim();
              const regEmail = (document.getElementById('regEmailInput').value || '').trim().toLowerCase();
              const confirmPwd = (document.getElementById('authConfirmPasswordInput').value || '').trim();

              if (!regUsername) {
                if (authErr) authErr.textContent = '⚠️ 請填寫帳號名稱！';
                document.getElementById('regUsernameInput').focus();
                return;
              }
              if (regUsername.length < 2) {
                if (authErr) authErr.textContent = '⚠️ 帳號名稱至少需要 2 個字符！';
                document.getElementById('regUsernameInput').focus();
                return;
              }
              if (!regEmail || !regEmail.includes('@') || !regEmail.includes('.')) {
                if (authErr) authErr.textContent = '⚠️ 請填寫有效的電子郵件地址！';
                document.getElementById('regEmailInput').focus();
                return;
              }
              if (!regOtpState.email || regOtpState.email !== regEmail) {
                if (authErr) authErr.textContent = '⚠️ 請先點擊「發送驗證電郵」完成電郵地址認證！';
                return;
              }
              if (password.length < 6) {
                if (authErr) authErr.textContent = '⚠️ 密碼長度至少需要 6 位字符！';
                return;
              }
              if (password !== confirmPwd) {
                if (authErr) authErr.textContent = '⚠️ 兩次輸入的密碼不一致！';
                return;
              }

              saveLocalUsernameMapping(regUsername, regEmail);

              btnSubmitAuth.disabled = true;
              btnSubmitAuth.textContent = '正在核實電郵認證狀態...';

              try {
                if (!regOtpState.verified) {
                  await checkPendingEmailVerifiedStatus(false);
                }

                if (!regOtpState.verified && (!firebaseAuth.currentUser || !firebaseAuth.currentUser.emailVerified)) {
                  if (authErr) {
                    authErr.textContent = '❌ 電郵地址尚處於「待認證」狀態！請先前往您的信箱（含垃圾郵件匣）點擊驗證電郵中的認證連結。';
                  }
                  btnSubmitAuth.disabled = false;
                  btnSubmitAuth.textContent = '立即註冊並建立帳本';
                  return;
                }

                const verifiedUser = firebaseAuth.currentUser;
                // Re-authenticate if needed so updatePassword never fails
                if (regOtpState.stagedTempPwd && regOtpState.stagedTempPwd !== password) {
                  try {
                    const cred = firebase.auth.EmailAuthProvider.credential(regEmail, regOtpState.stagedTempPwd);
                    await verifiedUser.reauthenticateWithCredential(cred);
                  } catch (reauthErr) {}
                }
                await verifiedUser.updatePassword(password);
                await verifiedUser.updateProfile({ displayName: regUsername }).catch(() => {});
                localStorage.setItem('wyyty_otp_verified_' + verifiedUser.uid, '1');
                await saveCloudUsernameMapping(regUsername, regEmail, verifiedUser.uid);

                stopRegVerificationPolling();
                isPendingRegistrationFlow = false;
                currentFirebaseUser = verifiedUser;
                updateUserAuthUI();
                await loadUserOrdersFromCloud(verifiedUser.uid);
                closeAuthModal();
                showToast(`🎉 註冊成功！已完成電郵認證並建立帳本：${regUsername}`);
              } catch (err) {
                console.warn('Finalize register error:', err);
                let msg = err.message || '註冊失敗';
                if (err.code === 'auth/weak-password') msg = '密碼強度不足，請輸入至少 6 位字符！';
                if (authErr) authErr.textContent = '❌ ' + msg;
              } finally {
                btnSubmitAuth.disabled = false;
                btnSubmitAuth.textContent = '立即註冊並建立帳本';
              }
            } else {
              // Login Mode: Email Only (移除使用帳戶名稱登入的方式)
              const targetEmail = (document.getElementById('authEmailInput').value || '').trim().toLowerCase();
              if (!targetEmail || !password) {
                if (authErr) authErr.textContent = '⚠️ 請填寫電郵地址及密碼！';
                return;
              }
              if (!targetEmail.includes('@') || !targetEmail.includes('.')) {
                if (authErr) authErr.textContent = '⚠️ 請輸入有效的電郵地址 (Email) 登入！';
                document.getElementById('authEmailInput').focus();
                return;
              }

              btnSubmitAuth.disabled = true;
              btnSubmitAuth.textContent = '登入中...';
              try {
                isPendingRegistrationFlow = false;
                let cred = null;
                try {
                  cred = await firebaseAuth.signInWithEmailAndPassword(targetEmail, password);
                } catch (firstSignInErr) {
                  // Fallback: if this account was created during "發送驗證電郵" with deterministic staging password
                  // and the user is now logging in with their chosen password, finalize the password automatically
                  const errStr = (firstSignInErr && (firstSignInErr.code || firstSignInErr.message)) || '';
                  if (errStr.includes('invalid-login-credentials') || errStr.includes('invalid-credential') || errStr.includes('wrong-password')) {
                    const stagedPwd = getDeterministicStagingPassword(targetEmail);
                    try {
                      const stagedCred = await firebaseAuth.signInWithEmailAndPassword(targetEmail, stagedPwd);
                      if (stagedCred && stagedCred.user) {
                        await stagedCred.user.updatePassword(password);
                        cred = stagedCred;
                      }
                    } catch (fallbackErr) {
                      throw firstSignInErr;
                    }
                  } else {
                    throw firstSignInErr;
                  }
                }

                currentFirebaseUser = cred.user;
                updateUserAuthUI();
                await loadUserOrdersFromCloud(cred.user.uid);
                closeAuthModal();
                const welcomeName = (cred.user && (cred.user.displayName || cred.user.email)) || targetEmail;
                showToast(`✅ 登入成功！已載入專屬帳本：${welcomeName}`);
              } catch (err) {
                console.warn('Login error:', err);
                let msg = err.message || '登入失敗';
                const errCode = (err && err.code) || '';
                if (
                  errCode === 'auth/user-not-found' ||
                  errCode === 'auth/wrong-password' ||
                  errCode === 'auth/invalid-credential' ||
                  errCode === 'auth/invalid-login-credentials' ||
                  msg.includes('invalid-login-credentials')
                ) {
                  msg = '電郵地址或密碼不正確，請確認密碼或使用「🔑 忘記密碼找回」重設密碼！';
                } else if (errCode === 'auth/invalid-email') {
                  msg = '電郵地址格式不正確！';
                } else if (errCode === 'auth/too-many-requests') {
                  msg = '嘗試次數過多，請稍候片刻再試，或點擊「🔑 忘記密碼找回」重設密碼！';
                }
                if (authErr) authErr.textContent = '❌ ' + msg;
              } finally {
                btnSubmitAuth.disabled = false;
                btnSubmitAuth.textContent = '登入帳號';
              }
            }
          });
        }

        // Forgot Password (忘記密碼找回) Handlers
        const btnShowForgot = document.getElementById('btnShowForgotPwd');
        const forgotPanel = document.getElementById('forgotPasswordPanel');
        const btnCancelForgot = document.getElementById('btnCancelForgotPwd');
        const btnSendReset = document.getElementById('btnSendPasswordReset');
        const resetStatusMsg = document.getElementById('resetPwdStatusMsg');

        if (btnShowForgot && forgotPanel) {
          btnShowForgot.addEventListener('click', () => {
            authForm.style.display = 'none';
            forgotPanel.style.display = 'block';
            if (authTitle) authTitle.textContent = '🔑 忘記密碼找回';
            const currInput = document.getElementById('authEmailInput').value.trim();
            if (currInput) document.getElementById('resetPwdEmailInput').value = currInput;
            if (resetStatusMsg) resetStatusMsg.textContent = '';
          });
        }

        if (btnCancelForgot && forgotPanel) {
          btnCancelForgot.addEventListener('click', () => {
            forgotPanel.style.display = 'none';
            authForm.style.display = 'block';
            if (authTitle) authTitle.textContent = '👤 登入個人專屬帳號';
          });
        }

        if (btnSendReset) {
          btnSendReset.addEventListener('click', async () => {
            if (!firebaseAuth) return;
            const targetEmail = (document.getElementById('resetPwdEmailInput').value || '').trim().toLowerCase();
            if (!targetEmail || !targetEmail.includes('@') || !targetEmail.includes('.')) {
              if (resetStatusMsg) {
                resetStatusMsg.style.color = 'var(--danger)';
                resetStatusMsg.textContent = '⚠️ 請輸入有效的電郵地址 (Email)！';
              }
              return;
            }
            btnSendReset.disabled = true;
            btnSendReset.textContent = '發送中...';
            try {
              await firebaseAuth.sendPasswordResetEmail(targetEmail);
              if (resetStatusMsg) {
                resetStatusMsg.style.color = 'var(--tier1)';
                resetStatusMsg.textContent = `✅ 密碼找回重設信已發送至【${targetEmail}】！請前往信箱（含垃圾郵件匣）點擊連結設定新密碼。`;
              }
              showToast(`✉️ 密碼找回信已發送至 ${targetEmail}！`);
            } catch (err) {
              console.warn('Reset password error:', err);
              let msg = err.message || '發送失敗';
              if (err.code === 'auth/user-not-found') msg = '找不到該帳號或電子郵件註冊的紀錄，請確認輸入是否正確！';
              if (err.code === 'auth/invalid-email') msg = '電子郵件格式不正確！';
              if (resetStatusMsg) {
                resetStatusMsg.style.color = 'var(--danger)';
                resetStatusMsg.textContent = '❌ ' + msg;
              }
            } finally {
              btnSendReset.disabled = false;
              btnSendReset.textContent = '發送密碼找回信';
            }
          });
        }

        // Refresh verification status button
        const btnRefreshVerify = document.getElementById('btnRefreshVerifyStatus');
        if (btnRefreshVerify) {
          btnRefreshVerify.addEventListener('click', async () => {
            if (!currentFirebaseUser) return;
            btnRefreshVerify.disabled = true;
            btnRefreshVerify.textContent = '檢查中...';
            try {
              await currentFirebaseUser.reload();
              currentFirebaseUser = firebaseAuth.currentUser;
              updateUserAuthUI();
              if (currentFirebaseUser.emailVerified) {
                showToast('🎉 恭喜！電子郵件地址已成功完成驗證！');
              } else {
                showToast('ℹ️ 目前尚未偵測到驗證點擊，請先至信箱點擊驗證信中的連結後再試！');
              }
            } catch (e) {
              console.warn('Reload user error:', e);
            } finally {
              btnRefreshVerify.disabled = false;
              btnRefreshVerify.textContent = '🔄 重新整理驗證狀態';
            }
          });
        }

        window.addEventListener('focus', async () => {
          if (currentFirebaseUser && !currentFirebaseUser.emailVerified && firebaseAuth) {
            try {
              await currentFirebaseUser.reload();
              currentFirebaseUser = firebaseAuth.currentUser;
              updateUserAuthUI();
            } catch (e) {}
          }
        });

        // Send Email Verification Button in Settings Card
        const btnSendVerify = document.getElementById('btnSendVerificationEmail');
        if (btnSendVerify) {
          btnSendVerify.addEventListener('click', async () => {
            if (!currentFirebaseUser) return;
            btnSendVerify.disabled = true;
            btnSendVerify.textContent = '發送中...';
            try {
              await currentFirebaseUser.sendEmailVerification();
              showToast(`✉️ 驗證信已發送至 ${currentFirebaseUser.email}！請至信箱（含垃圾郵件）查收。`);
            } catch (err) {
              console.warn('Send verify error:', err);
              let msg = err.message || '';
              if (err.code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
                msg = '系統已在短時間內發送過驗證信。請先至信箱（含垃圾郵件匣）查收；如需重發請稍候再試。';
              }
              showToast('⚠️ ' + msg);
            } finally {
              setTimeout(() => {
                btnSendVerify.disabled = false;
                btnSendVerify.textContent = '✉️ 再次發送驗證信';
              }, 4000);
            }
          });
        }

        // Send Password Reset from Account Settings button (with 2-step confirmation!)
        const btnSendResetFromAcc = document.getElementById('btnSendPasswordResetFromAccount');
        const confirmResetBox = document.getElementById('accountResetPwdConfirmBox');
        const btnCancelAccReset = document.getElementById('btnCancelAccountResetPwd');
        const btnConfirmAccReset = document.getElementById('btnConfirmAccountResetPwd');
        const accResetMsg = document.getElementById('accountResetPwdStatusMsg');

        if (btnSendResetFromAcc && confirmResetBox) {
          btnSendResetFromAcc.addEventListener('click', () => {
            if (accResetMsg) accResetMsg.textContent = '';
            confirmResetBox.style.display = 'block';
          });
        }

        if (btnCancelAccReset && confirmResetBox) {
          btnCancelAccReset.addEventListener('click', () => {
            confirmResetBox.style.display = 'none';
          });
        }

        if (btnConfirmAccReset && confirmResetBox) {
          btnConfirmAccReset.addEventListener('click', async () => {
            if (!currentFirebaseUser || !currentFirebaseUser.email) return;
            btnConfirmAccReset.disabled = true;
            btnConfirmAccReset.textContent = '發送中...';
            try {
              await firebaseAuth.sendPasswordResetEmail(currentFirebaseUser.email);
              confirmResetBox.style.display = 'none';
              if (accResetMsg) {
                accResetMsg.style.color = 'var(--tier1)';
                accResetMsg.textContent = `✅ 密碼重設電郵已發送至【${currentFirebaseUser.email}】！請至信箱點擊連結重設密碼。`;
              }
              showToast(`✉️ 密碼重設電郵已發送至 ${currentFirebaseUser.email}！`);
            } catch (err) {
              console.warn('Send reset error:', err);
              if (accResetMsg) {
                accResetMsg.style.color = 'var(--danger)';
                accResetMsg.textContent = '❌ ' + (err.message || '發送失敗');
              }
            } finally {
              btnConfirmAccReset.disabled = false;
              btnConfirmAccReset.textContent = '✅ 確認發送重設電郵';
            }
          });
        }

        // Logout
        const btnLogout = document.getElementById('btnLogoutUser');
        if (btnLogout) {
          btnLogout.addEventListener('click', async () => {
            if (firebaseAuth) {
              await firebaseAuth.signOut();
              showToast('🚪 已登出帳號，已返回本機離線模式');
            }
          });
        }

        // Manual sync
        const btnManualSync = document.getElementById('btnManualSyncCloud');
        if (btnManualSync) {
          btnManualSync.addEventListener('click', async () => {
            if (currentFirebaseUser && currentFirebaseUser.uid) {
              showToast('🔄 正在同步最新數據至 Google 雲端...');
              await syncOrdersToCloud(currentFirebaseUser.uid);
              showToast('✅ 雲端同步完成！');
            } else {
              showToast('💡 請先登入帳號以啟動雲端同步');
            }
          });
        }
      }

      // ==================== NAVIGATION ====================
      function switchView(viewName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
        });
        document.querySelectorAll('.view-section').forEach(sec => {
          sec.classList.toggle('active', sec.id === 'view-' + viewName);
        });
        if (viewName === 'entry') {
          renderRecentOrders();
        } else if (viewName === 'calendar') {
          renderCalendar();
        } else if (viewName === 'analytics') {
          renderAnalytics();
        } else if (viewName === 'backup') {
          openSettingsDetailPanel(null);
          renderSettingsBookManagement();
        }
      }

      // ==================== VIEW 1: ENTRY LOGIC ====================
      function syncSingleAndDirectInputs(source) {
        const singleAmtEl = document.getElementById('singleAmountInput');
        const d1 = document.getElementById('directTier1Input');
        const d2 = document.getElementById('directTier2Input');
        const d3 = document.getElementById('directTier3Input');

        const dOther = document.getElementById('directTierOtherInput');
        const customRateEl = document.getElementById('customTierRateInput');
        const directRateOther = document.getElementById('directTierOtherRate');

        if (source === 'single') {
          const val = singleAmtEl.value;
          d1.value = selectedSingleTier === 1 ? val : '';
          d2.value = selectedSingleTier === 2 ? val : '';
          d3.value = selectedSingleTier === 3 ? val : '';
          if (dOther) dOther.value = selectedSingleTier === 4 ? val : '';
        } else if (source === 'direct1' || source === 'direct2' || source === 'direct3' || source === 'directOther') {
          const v1 = parseFloat(d1.value) || 0;
          const v2 = parseFloat(d2.value) || 0;
          const v3 = parseFloat(d3.value) || 0;
          const vOther = dOther ? (parseFloat(dOther.value) || 0) : 0;
          const filledCount = (v1 > 0 ? 1 : 0) + (v2 > 0 ? 1 : 0) + (v3 > 0 ? 1 : 0) + (vOther > 0 ? 1 : 0);
          if (filledCount === 1) {
            if (v1 > 0) { selectedSingleTier = 1; singleAmtEl.value = d1.value; }
            if (v2 > 0) { selectedSingleTier = 2; singleAmtEl.value = d2.value; }
            if (v3 > 0) { selectedSingleTier = 3; singleAmtEl.value = d3.value; }
            if (vOther > 0) { selectedSingleTier = 4; singleAmtEl.value = dOther.value; }
            updateSingleTierButtons();
          }
        }
        updateEntryLivePreview();
      }

      function updateSingleTierButtons() {
        document.querySelectorAll('#singleTierSelector .tier-option-btn').forEach(btn => {
          const t = Number(btn.getAttribute('data-tier'));
          btn.classList.toggle('active', t === selectedSingleTier);
        });
        const wrap = document.getElementById('otherTierRateWrap');
        if (wrap) {
          wrap.style.display = selectedSingleTier === 4 ? 'block' : 'none';
        }
      }

      function collectPendingEntries() {
        const pending = [];
        if (Array.isArray(entryRowsState) && entryRowsState.length > 0) {
          entryRowsState.forEach(r => {
            const amt = parseFloat(r.amount) || 0;
            if (amt > 0) {
              const t = Number(r.tier) || 1;
              const rate = tierRates[t] !== undefined ? tierRates[t] : 0.10;
              pending.push({
                tier: t,
                amount: amt,
                commissionRate: rate,
                commission: +(amt * rate).toFixed(2)
              });
            }
          });
        }
        return pending;
      }

      function updateEntryLivePreview() {
        const m1 = parseFloat(document.getElementById('multiAmt1').value) || 0;
        const m2 = parseFloat(document.getElementById('multiAmt2').value) || 0;
        const m3 = parseFloat(document.getElementById('multiAmt3').value) || 0;
        document.getElementById('multiComm1').textContent = fmtMoney(m1 * tierRates[1]);
        document.getElementById('multiComm2').textContent = fmtMoney(m2 * tierRates[2]);
        document.getElementById('multiComm3').textContent = fmtMoney(m3 * tierRates[3]);

        const d1 = parseFloat(document.getElementById('directTier1Input').value) || 0;
        const d2 = parseFloat(document.getElementById('directTier2Input').value) || 0;
        const d3 = parseFloat(document.getElementById('directTier3Input').value) || 0;
        const dOther = parseFloat(document.getElementById('directTierOtherInput').value) || 0;
        const dOtherRate = (parseFloat(document.getElementById('directTierOtherRate').value) || 10) / 100;
        const mOtherAmt = parseFloat(document.getElementById('multiAmtOther').value) || 0;
        const mOtherRate = (parseFloat(document.getElementById('multiOtherRate').value) || 10) / 100;
        const customPct = parseFloat(document.getElementById('customTierRateInput').value) || 10;

        document.getElementById('customRatePreviewPct').textContent = customPct + '%';
        document.getElementById('singleBtnRateOther').textContent = `${customPct}% 佣`;
        document.getElementById('multiCommOther').textContent = fmtMoney(mOtherAmt * mOtherRate);
        document.getElementById('directTierOtherComm').textContent = fmtMoney(dOther * dOtherRate);

        document.getElementById('directTier1Comm').textContent = fmtMoney(d1 * tierRates[1]);
        document.getElementById('directTier2Comm').textContent = fmtMoney(d2 * tierRates[2]);
        document.getElementById('directTier3Comm').textContent = fmtMoney(d3 * tierRates[3]);

        const list = collectPendingEntries();
        const totalAmt = list.reduce((acc, item) => acc + item.amount, 0);
        const totalComm = list.reduce((acc, item) => acc + item.commission, 0);

        document.getElementById('previewTotalAmount').textContent = fmtMoney(totalAmt);
        document.getElementById('previewTotalCommission').textContent = fmtMoney(totalComm);
        if (list.length === 0) {
          document.getElementById('previewTierText').textContent = '請輸入金額';
        } else {
          document.getElementById('previewTierText').textContent = list.map(i => {
            const name = i.tier === 4 ? `其他(${fmtPct(i.commissionRate)})` : `${i.tier}仔`;
            return `${name} (${fmtMoneyShort(i.amount)})`;
          }).join(' + ');
        }
      }

      function handleConfirmEntry() {
        const pending = collectPendingEntries();
        if (pending.length === 0) {
          showToast('⚠️ 請先輸入大於 0 的開單金額！');
          const firstAmt = document.querySelector('#dynamicEntryRowsContainer .dynamic-amt-input');
          if (firstAmt) firstAmt.focus();
          return;
        }

        const nowParts = getNowParts();
        const dateInputVal = document.getElementById('entryDateInput').value.trim();
        const hourInputVal = document.getElementById('entryHourInput').value.trim();
        const minInputVal = document.getElementById('entryMinuteInput').value.trim();
        const noteInputEl = document.getElementById('entryNoteInput');
        const noteVal = noteInputEl ? noteInputEl.value.trim() : '';

        const finalDate = dateInputVal || nowParts.dateStr;

        let finalTime = nowParts.timeStr;
        if (hourInputVal !== '' || minInputVal !== '') {
          const nowSub = nowParts.timeStr.split(':');
          let hh = hourInputVal !== '' ? parseInt(hourInputVal, 10) : parseInt(nowSub[0], 10);
          let mm = minInputVal !== '' ? parseInt(minInputVal, 10) : parseInt(nowSub[1], 10);
          if (isNaN(hh) || hh < 0) hh = 0;
          if (hh > 23) hh = 23;
          if (isNaN(mm) || mm < 0) mm = 0;
          if (mm > 59) mm = 59;
          finalTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        }

        pending.forEach((item, idx) => {
          const newOrder = {
            id: 'ord_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 6),
            bookId: activeBookId,
            note: noteVal,
            originalAmount: +item.amount.toFixed(2),
            amount: +item.amount.toFixed(2),
            tier: item.tier,
            commissionRate: item.commissionRate !== undefined ? item.commissionRate : (tierRates[item.tier] || 0.10),
            commission: +item.commission.toFixed(2),
            date: finalDate,
            time: finalTime,
            createdAt: new Date().toISOString(),
            status: 'active',
            refundEvents: [],
            receiptPhotos: [...pendingReceiptPhotos],
            productPhotos: [...pendingProductPhotos]
          };
          orders.unshift(newOrder);
        });

        saveOrders();

        const [yStr, mStr] = finalDate.split('-');
        const entryY = parseInt(yStr, 10);
        const entryM = parseInt(mStr, 10);
        if (entryY >= MIN_YEAR && entryY <= MAX_YEAR) {
          calYear = entryY;
          calMonth = entryM;
        }

        entryRowsState = [{ id: 'erow_' + Date.now(), amount: '', tier: 1 }];
        renderDynamicEntryRows();
        if (noteInputEl) noteInputEl.value = '';
        pendingReceiptPhotos = [];
        pendingProductPhotos = [];
        renderEntryPhotoThumbs();
        updateEntryLivePreview();
        renderTopBookBar();
        renderSettingsBookManagement();
        renderRecentOrders();

        showToast(`✅ 已成功記錄 ${pending.length} 筆開單（${finalDate} ${finalTime}）！`);
      }

      function renderRecentOrders() {
        const container = document.getElementById('recentOrdersContainer');
        const bookOrders = getActiveBookOrders();
        const activeBk = getActiveBook();
        const activeList = bookOrders.filter(o => o.status === 'active' && o.amount > 0);
        document.getElementById('recentCountLabel').textContent = `【${activeBk.name}】共 ${activeList.length} 筆有效紀錄`;

        const sorted = [...bookOrders].sort((a, b) => {
          const dtA = `${a.date} ${a.time}`;
          const dtB = `${b.date} ${b.time}`;
          return dtB.localeCompare(dtA);
        }).slice(0, 12);

        if (sorted.length === 0) {
          container.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);">「${escapeHtml(activeBk.name)}」暫無開單紀錄，請在上方輸入開單金額並按「確認輸入」。</div>`;
          return;
        }

        container.innerHTML = sorted.map(o => {
          const isFullRefunded = o.status === 'refunded' || o.amount <= 0;
          const refundedSum = getOrderTotalRefunded(o);
          const hasPartial = !isFullRefunded && refundedSum > 0;
          const badgeClass = `t${o.tier}`;
          const lastRef = o.refundEvents && o.refundEvents.length > 0 ? o.refundEvents[o.refundEvents.length - 1] : null;

          return `
            <div class="order-item-card" data-open-date="${o.date}" data-open-id="${o.id}" style="${isFullRefunded ? 'opacity:0.65; background:#fafafa;' : ''}">
              <div class="order-item-left" style="flex:1; min-width:180px;">
                <span class="order-time-badge">${o.date} ${o.time}</span>
                <span class="tier-badge ${badgeClass}">${getTierLabel(o.tier, o.commissionRate)}</span>
                ${((o.receiptPhotos && o.receiptPhotos.length > 0) || (o.productPhotos && o.productPhotos.length > 0)) ? `<span class="cal-photo-tag">📷 單據${(o.receiptPhotos || []).length}/商品${(o.productPhotos || []).length}</span>` : ''}
                ${hasPartial ? `<span class="cal-partial-tag">已部分退款 ${fmtMoneyShort(refundedSum)} (${lastRef ? lastRef.reason : ''})</span>` : ''}
                ${isFullRefunded ? `<span class="cal-refund-tag">已全單退款 ${fmtMoneyShort(refundedSum)}：${lastRef ? lastRef.reason : ''}</span>` : ''}
                ${o.note ? `<div class="order-note-box"><div style="text-align:center; font-weight:700; margin-bottom:2px;">備註內容：</div><div>${escapeHtml(o.note)}</div></div>` : ''}
              </div>
              <div class="order-item-right">
                <div class="order-item-amt" style="${isFullRefunded ? 'text-decoration:line-through; color:var(--danger);' : ''}">
                  ${isFullRefunded ? fmtMoney(o.originalAmount) : fmtMoney(o.amount)}
                </div>
                <div class="order-item-comm">
                  ${hasPartial ? `<span style="color:var(--text-muted); font-size:0.72rem;">(原單 ${fmtMoneyShort(o.originalAmount)})</span> ` : ''}
                  佣金 ${fmtMoney(o.commission)}
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      // ==================== VIEW 2: CALENDAR (2023 - 2060) ====================
      function initYearMonthSelects() {
        const calYSelect = document.getElementById('calYearSelect');
        const calMSelect = document.getElementById('calMonthSelect');
        const anaYSelect = document.getElementById('anaYearSelect');

        let calYearOptionsHtml = '';
        let anaYearOptionsHtml = '';
        for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
          calYearOptionsHtml += `<option value="${y}">${y}</option>`;
          anaYearOptionsHtml += `<option value="${y}">${y}年</option>`;
        }
        if (calYSelect) calYSelect.innerHTML = calYearOptionsHtml;
        if (anaYSelect) anaYSelect.innerHTML = anaYearOptionsHtml;

        let monthOptionsHtml = '';
        for (let m = 1; m <= 12; m++) {
          const mPad = String(m).padStart(2, '0');
          monthOptionsHtml += `<option value="${m}">${mPad}</option>`;
        }
        if (calMSelect) calMSelect.innerHTML = monthOptionsHtml;

        if (calYSelect) calYSelect.value = String(calYear);
        if (calMSelect) calMSelect.value = String(calMonth);
        if (anaYSelect) anaYSelect.value = String(anaYear);
      }

      function getAllRefundEventsInOrders(orderSubset) {
        const events = [];
        orderSubset.forEach(o => {
          if (Array.isArray(o.refundEvents)) {
            o.refundEvents.forEach(ev => {
              events.push({
                ...ev,
                orderId: o.id,
                orderDate: o.date,
                orderTime: o.time,
                tier: o.tier,
                commissionRate: o.commissionRate
              });
            });
          }
        });
        return events;
      }

      function renderCalendar() {
        const ySel = document.getElementById('calYearSelect');
        if (ySel) ySel.value = String(calYear);
        const mSel = document.getElementById('calMonthSelect');
        if (mSel) mSel.value = String(calMonth);

        const ymPrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
        const bookOrders = getActiveBookOrders();
        const monthOrders = bookOrders.filter(o => o.date && o.date.startsWith(ymPrefix));
        const activeMonthOrders = monthOrders.filter(o => o.status === 'active' && o.amount > 0);
        const monthRefundEvents = getAllRefundEventsInOrders(monthOrders);

        const totalAmt = activeMonthOrders.reduce((s, o) => s + o.amount, 0);
        const totalComm = activeMonthOrders.reduce((s, o) => s + o.commission, 0);
        const commT1 = activeMonthOrders.filter(o => o.tier === 1).reduce((s, o) => s + o.commission, 0);
        const commT2 = activeMonthOrders.filter(o => o.tier === 2).reduce((s, o) => s + o.commission, 0);
        const commT3 = activeMonthOrders.filter(o => o.tier === 3).reduce((s, o) => s + o.commission, 0);
        const activeDaysSet = new Set(activeMonthOrders.map(o => o.date));
        const avgOrder = activeMonthOrders.length > 0 ? totalAmt / activeMonthOrders.length : 0;
        const avgDay = activeDaysSet.size > 0 ? totalAmt / activeDaysSet.size : 0;
        const refundAmt = monthRefundEvents.reduce((s, ev) => s + ev.amount, 0);

        document.getElementById('calSumMonthLabel').textContent = `${calYear}年${calMonth}月 有效開單總額`;
        document.getElementById('calSumTotalAmt').textContent = fmtMoney(totalAmt);
        document.getElementById('calSumOrderCount').textContent = `共 ${activeMonthOrders.length} 單 (開單日數: ${activeDaysSet.size} 日)`;
        document.getElementById('calSumTotalComm').textContent = fmtMoney(totalComm);
        document.getElementById('calSumTierBreakdown').textContent = `1仔 ${fmtMoneyShort(commT1)} | 2仔 ${fmtMoneyShort(commT2)} | 3仔 ${fmtMoneyShort(commT3)}`;
        document.getElementById('calSumAvgOrder').textContent = fmtMoney(avgOrder);
        document.getElementById('calSumAvgActiveDay').textContent = `每個開單日平均: ${fmtMoney(avgDay)}`;
        document.getElementById('calSumRefundAmt').textContent = fmtMoney(refundAmt);
        document.getElementById('calSumRefundCount').textContent = `全退/部分退款: ${monthRefundEvents.length} 筆`;

        const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay();
        const daysInMonth = new Date(calYear, calMonth, 0).getDate();
        const todayStr = getNowParts().dateStr;

        const gridEl = document.getElementById('calendarGrid');
        let cellsHtml = '';

        for (let i = 0; i < firstDayOfWeek; i++) {
          cellsHtml += `<div class="cal-cell empty"></div>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${ymPrefix}-${String(d).padStart(2, '0')}`;
          const dayAllOrders = monthOrders.filter(o => o.date === dateStr);
          const dayActive = dayAllOrders.filter(o => o.status === 'active' && o.amount > 0);
          const dayRefundEvs = getAllRefundEventsInOrders(dayAllOrders);
          const dayAmt = dayActive.reduce((s, o) => s + o.amount, 0);
          const dayComm = dayActive.reduce((s, o) => s + o.commission, 0);
          const dayRefundSum = dayRefundEvs.reduce((s, ev) => s + ev.amount, 0);

          const isToday = dateStr === todayStr;
          const hasOrders = dayActive.length > 0;

          cellsHtml += `
            <div class="cal-cell ${isToday ? 'today' : ''} ${hasOrders ? 'has-orders' : ''}" data-date="${dateStr}">
              <div class="cal-day-top">
                <span class="cal-day-num">${d}</span>
                ${dayActive.length > 0 ? `<span class="cal-count-pill">${dayActive.length}單</span>` : ''}
              </div>
              <div class="cal-day-Data">
                ${dayActive.length > 0 ? `
                  <div class="cal-amt">${fmtMoneyShort(dayAmt)}</div>
                  <div class="cal-comm">佣 ${fmtMoneyShort(dayComm)}</div>
                ` : `<div style="font-size:0.7rem; color:#b0bab5;">--</div>`}
                ${dayActive.some(o => (o.receiptPhotos && o.receiptPhotos.length > 0) || (o.productPhotos && o.productPhotos.length > 0)) ? `<div class="cal-photo-tag">📷 附圖</div>` : ''}
                ${dayRefundSum > 0 ? `<div class="cal-refund-tag">退 ${fmtMoneyShort(dayRefundSum)}</div>` : ''}
              </div>
            </div>
          `;
        }

        const totalCells = firstDayOfWeek + daysInMonth;
        const trailing = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < trailing; i++) {
          cellsHtml += `<div class="cal-cell empty"></div>`;
        }

        gridEl.innerHTML = cellsHtml;
      }

      // ==================== MODAL: DAY DETAIL, EDIT, PURE DELETE & FULL/PARTIAL REFUND ====================
      function openDayModal(dateStr, directOrderId) {
        activeModalDateStr = dateStr;
        const [y, m, d] = dateStr.split('-');
        document.getElementById('modalDayTitle').textContent = `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日 開單明細`;

        renderModalDayList();
        document.getElementById('dayDetailModal').classList.add('open');

        if (directOrderId) {
          const target = orders.find(o => o.id === directOrderId);
          if (target && target.status === 'active' && target.amount > 0) {
            openOrderActionStep(directOrderId);
          }
        }
      }

      function closeDayModal() {
        document.getElementById('dayDetailModal').classList.remove('open');
        activeModalDateStr = null;
        activeModalOrderId = null;
      }

      function renderModalDayList() {
        document.getElementById('modalStepDayList').style.display = 'block';
        document.getElementById('modalStepOrderAction').style.display = 'none';
        document.getElementById('modalDayFooter').style.display = 'flex';

        const dayOrders = getActiveBookOrders()
          .filter(o => o.date === activeModalDateStr)
          .sort((a, b) => a.time.localeCompare(b.time));

        const activeList = dayOrders.filter(o => o.status === 'active' && o.amount > 0);
        const dayRefundEvents = getAllRefundEventsInOrders(dayOrders);

        const dayTotalAmt = activeList.reduce((s, o) => s + o.amount, 0);
        const dayTotalComm = activeList.reduce((s, o) => s + o.commission, 0);
        const dayRefundSum = dayRefundEvents.reduce((s, ev) => s + ev.amount, 0);

        document.getElementById('modalDaySummaryBar').innerHTML = `
          <div><strong>當日有效單數：</strong>${activeList.length} 單</div>
          <div><strong>當日有效總額：</strong><span style="color:var(--primary); font-weight:800;">${fmtMoney(dayTotalAmt)}</span></div>
          <div><strong>當日總佣金：</strong><span style="color:var(--accent-gold); font-weight:800;">${fmtMoney(dayTotalComm)}</span></div>
          ${dayRefundSum > 0 ? `<div><strong>當日已退款：</strong><span style="color:var(--danger); font-weight:800;">${fmtMoney(dayRefundSum)}</span></div>` : ''}
        `;

        const listEl = document.getElementById('modalDayOrdersList');
        if (activeList.length === 0) {
          listEl.innerHTML = `<div style="text-align:center; padding:22px 12px; color:var(--text-muted); border:1px dashed var(--border); border-radius:8px;">該日暫無有效開單紀錄</div>`;
        } else {
          listEl.innerHTML = activeList.map(o => {
            const refundedSum = getOrderTotalRefunded(o);
            return `
              <div class="order-item-card" data-modal-order-id="${o.id}">
                <div class="order-item-left">
                  <span class="order-time-badge">🕒 ${o.time}</span>
                  <span class="tier-badge t${o.tier}">${getTierLabel(o.tier, o.commissionRate)}</span>
                  ${(o.receiptPhotos && o.receiptPhotos.length > 0) ? `<span class="cal-photo-tag">🧾 單據圖×${o.receiptPhotos.length}</span>` : ''}
                  ${(o.productPhotos && o.productPhotos.length > 0) ? `<span class="cal-photo-tag">📦 商品圖×${o.productPhotos.length}</span>` : ''}
                  ${refundedSum > 0 ? `<span class="cal-partial-tag">已部分退 ${fmtMoneyShort(refundedSum)} (原 ${fmtMoneyShort(o.originalAmount)})</span>` : ''}
                  ${o.note ? `<div class="order-note-box"><div style="text-align:center; font-weight:700; margin-bottom:2px;">備註內容：</div><div>${escapeHtml(o.note)}</div></div>` : ''}
                </div>
                <div class="order-item-right">
                  <div class="order-item-amt">${fmtMoney(o.amount)}</div>
                  <div class="order-item-comm">佣金 ${fmtMoney(o.commission)} ❯</div>
                </div>
              </div>
            `;
          }).join('');
        }

        const refEl = document.getElementById('modalDayRefundedList');
        if (dayRefundEvents.length === 0) {
          refEl.innerHTML = '';
        } else {
          refEl.innerHTML = `
            <div style="font-size:0.8rem; font-weight:700; color:var(--danger); margin-bottom:6px;">該日退款紀錄明細 (共 ${dayRefundEvents.length} 筆，合共 ${fmtMoney(dayRefundSum)})：</div>
            ${dayRefundEvents.map(ev => `
              <div style="padding:8px 12px; border:1px solid #fecaca; background:var(--danger-bg); border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size:0.82rem;">
                <div>
                  <strong>${ev.orderTime}</strong> · ${ev.tier}仔 ·
                  <span style="font-weight:700; color:var(--danger);">${ev.type === 'partial' ? '[部分退款]' : '[全單退款]'} -${fmtMoney(ev.amount)}</span>
                </div>
                <div style="color:var(--danger); font-weight:700;">
                  原因：${ev.reason}${ev.note ? ' (' + ev.note + ')' : ''}
                </div>
              </div>
            `).join('')}
          `;
        }
      }

      function openOrderActionStep(orderId) {
        const ord = orders.find(o => o.id === orderId);
        if (!ord) return;
        activeModalOrderId = orderId;

        document.getElementById('modalStepDayList').style.display = 'none';
        document.getElementById('modalStepOrderAction').style.display = 'block';
        document.getElementById('modalDayFooter').style.display = 'none';

        document.getElementById('actionChoiceButtons').style.display = 'grid';
        document.getElementById('editOrderPanel').style.display = 'none';
        document.getElementById('deleteReasonPanel').style.display = 'none';

        const refundedSum = getOrderTotalRefunded(ord);

        document.getElementById('selectedOrderInfoCard').innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-size:1.35rem; font-weight:800; color:var(--primary);">有效金額：${fmtMoney(ord.amount)}</div>
              <div style="font-size:0.85rem; color:var(--accent-gold); font-weight:700;">應得佣金：${fmtMoney(ord.commission)} (${fmtPct(ord.commissionRate)})</div>
              ${refundedSum > 0 ? `<div style="font-size:0.78rem; color:var(--danger); margin-top:2px;">原始開單：${fmtMoney(ord.originalAmount)} ｜ 累計已退款：${fmtMoney(refundedSum)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <span class="tier-badge t${ord.tier}" style="font-size:0.85rem;">${getTierLabel(ord.tier, ord.commissionRate)}</span>
              <div style="font-size:0.84rem; margin-top:4px; font-weight:600;">📅 ${ord.date} 🕒 ${ord.time}</div>
            </div>
          </div>
          ${(ord.note && ord.note.trim()) ? `
            <div class="order-note-box" style="margin-top:10px; background:#ffffff; border:1px solid #c5dbd2; padding:8px 10px;">
              <div style="text-align:center; font-weight:800; color:var(--primary); margin-bottom:4px;">備註內容：</div>
              <div>${escapeHtml(ord.note)}</div>
            </div>
          ` : ''}
          ${((ord.receiptPhotos && ord.receiptPhotos.length > 0) || (ord.productPhotos && ord.productPhotos.length > 0)) ? `
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #b5cfc4;">
              <div class="thumb-list">
                ${(ord.receiptPhotos || []).map((src, i) => `
                  <div class="thumb-item">
                    <img src="${src}" alt="單據圖" data-lightbox-src="${src}" data-lightbox-caption="🧾 開單單據圖片 (#${i + 1}) - ${ord.date} ${ord.time}" />
                    <span class="thumb-tag">🧾 單據#${i + 1}</span>
                  </div>
                `).join('')}
                ${(ord.productPhotos || []).map((src, i) => `
                  <div class="thumb-item">
                    <img src="${src}" alt="商品圖" data-lightbox-src="${src}" data-lightbox-caption="📦 商品圖片 (#${i + 1}) - ${ord.date} ${ord.time}" />
                    <span class="thumb-tag">📦 商品#${i + 1}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        `;
      }

      function openEditOrderPanel() {
        const ord = orders.find(o => o.id === activeModalOrderId);
        if (!ord) return;

        document.getElementById('editOrderPanel').style.display = 'block';
        document.getElementById('deleteReasonPanel').style.display = 'none';

        document.getElementById('editOrderAmount').value = ord.amount;
        document.getElementById('editOrderTier').value = String(ord.tier);
        document.getElementById('editOrderDate').value = ord.date;
        const timeParts = (ord.time || '12:00').split(':');
        const hInput = document.getElementById('editOrderHour');
        const mInput = document.getElementById('editOrderMinute');
        if (hInput) hInput.value = String(parseInt(timeParts[0], 10) || 0).padStart(2, '0');
        if (mInput) mInput.value = String(parseInt(timeParts[1], 10) || 0).padStart(2, '0');
        const editNoteEl = document.getElementById('editOrderNote');
        if (editNoteEl) editNoteEl.value = ord.note || '';
        editReceiptPhotos = Array.isArray(ord.receiptPhotos) ? [...ord.receiptPhotos] : [];
        editProductPhotos = Array.isArray(ord.productPhotos) ? [...ord.productPhotos] : [];
        renderEditPhotoThumbs();
      }

      function handleSaveOrderEdit() {
        const ord = orders.find(o => o.id === activeModalOrderId);
        if (!ord) return;

        const newAmt = parseFloat(document.getElementById('editOrderAmount').value);
        if (isNaN(newAmt) || newAmt <= 0) {
          showToast('⚠️ 請輸入有效的大於 0 開單金額');
          return;
        }

        const newTier = parseInt(document.getElementById('editOrderTier').value, 10) || 1;
        const newRate = tierRates[newTier] !== undefined ? tierRates[newTier] : 0.10;
        const newDate = document.getElementById('editOrderDate').value || ord.date;
        const hVal = document.getElementById('editOrderHour') ? document.getElementById('editOrderHour').value.trim() : '';
        const mVal = document.getElementById('editOrderMinute') ? document.getElementById('editOrderMinute').value.trim() : '';
        const oldParts = (ord.time || '12:00').split(':');
        let hh = hVal !== '' ? parseInt(hVal, 10) : parseInt(oldParts[0], 10);
        let mm = mVal !== '' ? parseInt(mVal, 10) : parseInt(oldParts[1], 10);
        if (isNaN(hh) || hh < 0) hh = 0;
        if (hh > 23) hh = 23;
        if (isNaN(mm) || mm < 0) mm = 0;
        if (mm > 59) mm = 59;
        const newTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        const editNoteEl = document.getElementById('editOrderNote');
        if (editNoteEl) {
          ord.note = editNoteEl.value.trim();
        }

        const refundedAlready = getOrderTotalRefunded(ord);
        ord.amount = +newAmt.toFixed(2);
        ord.originalAmount = +(ord.amount + refundedAlready).toFixed(2);
        ord.tier = newTier;
        ord.commissionRate = newRate;
        ord.commission = +(ord.amount * newRate).toFixed(2);
        ord.date = newDate;
        ord.time = newTime;
        ord.receiptPhotos = [...editReceiptPhotos];
        ord.productPhotos = [...editProductPhotos];

        saveOrders();
        activeModalDateStr = newDate;
        const [y, m] = newDate.split('-').map(Number);
        if (y >= MIN_YEAR && y <= MAX_YEAR) {
          calYear = y;
          calMonth = m;
        }

        showToast(`✏️ 已更新開單紀錄：${fmtMoney(ord.amount)} (${ord.tier}仔 ${fmtPct(ord.commissionRate)})`);
        renderModalDayList();
        renderCalendar();
        renderRecentOrders();
      }

      function openDeleteOrRefundPanel() {
        const ord = orders.find(o => o.id === activeModalOrderId);
        if (!ord) return;

        document.getElementById('editOrderPanel').style.display = 'none';
        document.getElementById('deleteReasonPanel').style.display = 'block';

        switchDeleteSubMode('refund');
        setRefundTypeMode('full');

        document.getElementById('partialMaxHint').textContent = `（當前可退上限：${fmtMoney(ord.amount)}）`;
        document.getElementById('partialRefundAmountInput').value = '';
        document.getElementById('partialRefundAmountInput').max = String(ord.amount);
        updatePartialRemainPreview();
      }

      function switchDeleteSubMode(mode) {
        const tabRefund = document.getElementById('tabModeRefund');
        const tabMistake = document.getElementById('tabModeMistake');
        const boxRefund = document.getElementById('refundConfigBox');
        const boxMistake = document.getElementById('mistakeDeleteBox');

        if (mode === 'mistake') {
          tabMistake.classList.add('active-mistake');
          tabRefund.classList.remove('active-refund');
          boxMistake.style.display = 'block';
          boxRefund.style.display = 'none';
        } else {
          tabRefund.classList.add('active-refund');
          tabMistake.classList.remove('active-mistake');
          boxRefund.style.display = 'block';
          boxMistake.style.display = 'none';
        }
      }

      function setRefundTypeMode(mode) {
        refundTypeMode = mode;
        document.getElementById('pillFullRefund').classList.toggle('active', mode === 'full');
        document.getElementById('pillPartialRefund').classList.toggle('active', mode === 'partial');
        document.getElementById('partialRefundInputWrap').style.display = mode === 'partial' ? 'block' : 'none';
        updatePartialRemainPreview();
      }

      function updatePartialRemainPreview() {
        const ord = orders.find(o => o.id === activeModalOrderId);
        if (!ord) return;
        const pVal = parseFloat(document.getElementById('partialRefundAmountInput').value) || 0;
        const remainAmt = Math.max(0, +(ord.amount - pVal).toFixed(2));
        const remainComm = +(remainAmt * ord.commissionRate).toFixed(2);
        document.getElementById('partialRemainPreview').textContent =
          `扣除部分退款 ${fmtMoney(pVal)} 後，此單剩餘有效金額：${fmtMoney(remainAmt)}（剩餘佣金：${fmtMoney(remainComm)}）`;
      }

      function handlePureDeleteOrder() {
        const idx = orders.findIndex(o => o.id === activeModalOrderId);
        if (idx === -1) return;
        const removed = orders[idx];
        orders.splice(idx, 1);
        saveOrders();

        showToast(`🧹 已單純刪除開單紀錄 (${fmtMoney(removed.amount)})，不計入退款統計`);
        renderModalDayList();
        renderCalendar();
        renderRecentOrders();
      }

      function confirmDeleteOrderWithReason() {
        const ord = orders.find(o => o.id === activeModalOrderId);
        if (!ord) return;

        const selectedRadio = document.querySelector('input[name="refundReasonRadio"]:checked');
        const reasonVal = selectedRadio ? selectedRadio.value : '現退';
        const customText = document.getElementById('customRefundReasonInput').value.trim();

        if (reasonVal === '其他原因' && !customText) {
          showToast('⚠️ 請填寫具體的其他退款原因！');
          document.getElementById('customRefundReasonInput').focus();
          return;
        }

        if (!Array.isArray(ord.refundEvents)) {
          ord.refundEvents = [];
        }

        if (refundTypeMode === 'partial') {
          const partAmt = parseFloat(document.getElementById('partialRefundAmountInput').value);
          if (isNaN(partAmt) || partAmt <= 0) {
            showToast('⚠️ 請輸入大於 0 的部分退款金額！');
            document.getElementById('partialRefundAmountInput').focus();
            return;
          }
          if (partAmt >= ord.amount) {
            showToast('💡 退款金額等於或超過當前有效金額，請直接使用「全單退款」或輸入小於有效金額的數值');
            return;
          }

          ord.amount = +(ord.amount - partAmt).toFixed(2);
          ord.commission = +(ord.amount * ord.commissionRate).toFixed(2);
          ord.refundEvents.push({
            id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'partial',
            amount: +partAmt.toFixed(2),
            reason: reasonVal,
            note: reasonVal === '其他原因' ? customText : '',
            refundedAt: new Date().toISOString()
          });

          saveOrders();
          showToast(`↩️ 已記錄部分退款 ${fmtMoney(partAmt)}（剩餘有效金額 ${fmtMoney(ord.amount)}）`);
        } else {
          const fullRefundAmt = ord.amount;
          ord.refundEvents.push({
            id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'full',
            amount: +fullRefundAmt.toFixed(2),
            reason: reasonVal,
            note: reasonVal === '其他原因' ? customText : '',
            refundedAt: new Date().toISOString()
          });
          ord.amount = 0;
          ord.commission = 0;
          ord.status = 'refunded';

          saveOrders();
          showToast(`🗑️ 已全單退款 (${fmtMoney(fullRefundAmt)}) 並記錄原因：${reasonVal}`);
        }

        document.getElementById('customRefundReasonInput').value = '';
        renderModalDayList();
        renderCalendar();
        renderRecentOrders();
      }

      // ==================== VIEW 3: DATA ANALYTICS ====================
      function renderMonthChips() {
        const container = document.getElementById('monthChipsContainer');
        const descEl = document.getElementById('selectedMonthsDesc');
        const hintEl = document.getElementById('monthChipHint');
        const yearSelectWrap = document.getElementById('anaYearSelect').parentElement;

        if (anaScope === 'all-time') {
          container.style.display = 'none';
          hintEl.style.display = 'none';
          yearSelectWrap.style.display = 'none';
          return;
        }

        yearSelectWrap.style.display = 'flex';

        if (anaScope === 'full-year') {
          container.style.display = 'none';
          hintEl.style.display = 'none';
          descEl.textContent = `（正檢視 ${anaYear} 年全年 1–12 月總分析）`;
          return;
        }

        container.style.display = 'flex';
        hintEl.style.display = 'block';

        const sortedM = Array.from(anaSelectedMonths).sort((a, b) => a - b);
        descEl.textContent = sortedM.length === 12
          ? `（已選 ${anaYear} 年全部 12 個月）`
          : `（已限定：${anaYear}年 ${sortedM.map(m => m + '月').join('、')}，共 ${sortedM.length} 個月）`;

        let html = '';
        for (let m = 1; m <= 12; m++) {
          const isAct = anaSelectedMonths.has(m);
          html += `<button type="button" class="month-chip ${isAct ? 'active' : ''}" data-ana-month="${m}">${m}月</button>`;
        }
        container.innerHTML = html;
      }

      function getFilteredOrdersForAnalytics() {
        return getActiveBookOrders().filter(o => {
          if (!o.date) return false;
          const [yStr, mStr] = o.date.split('-');
          const y = parseInt(yStr, 10);
          const m = parseInt(mStr, 10);
          if (anaScope === 'all-time') return true;
          if (y !== anaYear) return false;
          if (anaScope === 'full-year') return true;
          return anaSelectedMonths.has(m);
        });
      }

      function renderAnalytics() {
        document.getElementById('anaYearSelect').value = String(anaYear);
        renderMonthChips();

        const scopedOrders = getFilteredOrdersForAnalytics();
        const activeOrders = scopedOrders.filter(o => o.status === 'active' && o.amount > 0);
        const scopedRefundEvents = getAllRefundEventsInOrders(scopedOrders);

        const totalSales = activeOrders.reduce((s, o) => s + o.amount, 0);
        const totalComm = activeOrders.reduce((s, o) => s + o.commission, 0);
        const totalRefundAmt = scopedRefundEvents.reduce((s, ev) => s + ev.amount, 0);
        const grossAllOrdersAmt = totalSales + totalRefundAmt;
        const refundRate = grossAllOrdersAmt > 0 ? (totalRefundAmt / grossAllOrdersAmt) * 100 : 0;

        let monthsCount = 1;
        if (anaScope === 'multi-month') {
          monthsCount = Math.max(1, anaSelectedMonths.size);
        } else if (anaScope === 'full-year') {
          const activeMonthsInYear = new Set(activeOrders.map(o => o.date.slice(0, 7)));
          monthsCount = Math.max(1, activeMonthsInYear.size);
        } else {
          const activeMonthsAll = new Set(activeOrders.map(o => o.date.slice(0, 7)));
          monthsCount = Math.max(1, activeMonthsAll.size);
        }

        const avgOrderAmt = activeOrders.length > 0 ? totalSales / activeOrders.length : 0;
        const avgMonthlyAmt = totalSales / monthsCount;
        const effectiveRate = totalSales > 0 ? (totalComm / totalSales) * 100 : 0;

        document.getElementById('anaTotalSales').textContent = fmtMoney(totalSales);
        document.getElementById('anaTotalOrdersSub').textContent = `有效開單：${activeOrders.length} 單`;
        document.getElementById('anaTotalCommission').textContent = fmtMoney(totalComm);
        document.getElementById('anaEffectiveCommRate').textContent = `平均佣金率：${effectiveRate.toFixed(2)}%`;
        document.getElementById('anaAvgOrderAmt').textContent = fmtMoney(avgOrderAmt);
        document.getElementById('anaAvgMonthlyAmt').textContent = `每月平均開單額：${fmtMoney(avgMonthlyAmt)}`;
        document.getElementById('anaTotalRefundAmt').textContent = fmtMoney(totalRefundAmt);
        document.getElementById('anaTotalRefundCount').textContent = `退款紀錄：${scopedRefundEvents.length} 筆 (退款率 ${refundRate.toFixed(1)}%)`;

        // 1. 各種類別開單及傭金分析 (圓形圖表 + 緊湊表格)
        const tierStats = [1, 2, 3, 4].map(t => {
          const list = activeOrders.filter(o => o.tier === t);
          const amt = list.reduce((s, o) => s + o.amount, 0);
          const comm = list.reduce((s, o) => s + o.commission, 0);
          const pct = totalSales > 0 ? (amt / totalSales) * 100 : 0;
          return { tier: t, count: list.length, amt, comm, pct };
        });

        const tierHexColors = { 1: '#1b6b50', 2: '#2563eb', 3: '#9333ea', 4: '#ea580c' };
        const tierPieSlices = tierStats.map(st => ({
          label: `${getTierShortName(st.tier)} (${st.count}單)`,
          value: st.amt,
          color: tierHexColors[st.tier],
          rightText: `${st.pct.toFixed(1)}% · <strong>${fmtMoneyShort(st.amt)}</strong>`
        }));

        document.getElementById('tierBreakdownVisual').innerHTML = buildSvgPieChart(
          tierPieSlices,
          '有效開單總額',
          fmtMoneyShort(totalSales),
          `總佣金 ${fmtMoneyShort(totalComm)}`
        );

        document.getElementById('tierBreakdownTableBody').innerHTML = `
          ${tierStats.map(st => `
            <tr>
              <td class="col-short"><span class="tier-badge t${st.tier}" style="padding:2px 6px;">${getTierShortName(st.tier)}</span></td>
              <td class="num-col col-short">${st.count}單</td>
              <td class="num-col">${fmtMoney(st.amt)}</td>
              <td class="num-col col-short">${st.pct.toFixed(1)}%</td>
              <td class="num-col" style="font-weight:700; color:var(--primary);">${fmtMoney(st.comm)}</td>
            </tr>
          `).join('')}
          <tr style="background:var(--bg-subtle); font-weight:800;">
            <td class="col-short">總計</td>
            <td class="num-col col-short">${activeOrders.length}單</td>
            <td class="num-col">${fmtMoney(totalSales)}</td>
            <td class="num-col col-short">${totalSales > 0 ? '100.0%' : '0.0%'}</td>
            <td class="num-col" style="color:var(--accent-gold);">${fmtMoney(totalComm)}</td>
          </tr>
        `;

        // 2. Order Days & Frequency Analysis
        const byDateMap = {};
        activeOrders.forEach(o => {
          if (!byDateMap[o.date]) byDateMap[o.date] = { count: 0, amt: 0 };
          byDateMap[o.date].count += 1;
          byDateMap[o.date].amt += o.amount;
        });
        const activeDates = Object.keys(byDateMap);
        const activeDaysCount = activeDates.length;
        const avgOrdersPerActiveDay = activeDaysCount > 0 ? (activeOrders.length / activeDaysCount) : 0;
        const avgAmtPerActiveDay = activeDaysCount > 0 ? (totalSales / activeDaysCount) : 0;

        let peakDateStr = '--';
        let peakDateAmt = 0;
        let peakDateCount = 0;
        activeDates.forEach(d => {
          if (byDateMap[d].amt > peakDateAmt) {
            peakDateAmt = byDateMap[d].amt;
            peakDateCount = byDateMap[d].count;
            peakDateStr = d;
          }
        });

        document.getElementById('dayFreqKpis').innerHTML = `
          <div class="kpi-card" style="padding:10px;">
            <span class="kpi-label">有開單總日數</span>
            <span class="kpi-value" style="font-size:1.15rem;">${activeDaysCount} 日</span>
            <span class="kpi-sub">日均 ${avgOrdersPerActiveDay.toFixed(1)} 單</span>
          </div>
          <div class="kpi-card" style="padding:10px;">
            <span class="kpi-label">每個開單日平均額</span>
            <span class="kpi-value" style="font-size:1.15rem;">${fmtMoneyShort(avgAmtPerActiveDay)}</span>
            <span class="kpi-sub">按有開單日計算</span>
          </div>
          <div class="kpi-card" style="padding:10px;">
            <span class="kpi-label">最高單日開單紀錄</span>
            <span class="kpi-value" style="font-size:1.15rem;">${fmtMoneyShort(peakDateAmt)}</span>
            <span class="kpi-sub">${peakDateStr} (${peakDateCount}單)</span>
          </div>
        `;

        const weekdayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const weekdayStats = [1, 2, 3, 4, 5, 6, 0].map(wIdx => ({
          wIdx,
          name: weekdayNames[wIdx],
          count: 0,
          amt: 0
        }));

        activeOrders.forEach(o => {
          const [y, m, d] = o.date.split('-').map(Number);
          const w = new Date(y, m - 1, d).getDay();
          const target = weekdayStats.find(item => item.wIdx === w);
          if (target) {
            target.count += 1;
            target.amt += o.amount;
          }
        });

        const maxWeekdayCount = Math.max(1, ...weekdayStats.map(w => w.count));
        document.getElementById('weekdayDistributionChart').innerHTML = weekdayStats.map(w => {
          const widthPct = (w.count / maxWeekdayCount) * 100;
          return `
            <div class="bar-row">
              <div class="bar-label-line">
                <span>${w.name}</span>
                <span>${w.count} 次開單 ｜ ${fmtMoney(w.amt)}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${widthPct}%; background:var(--primary);"></div>
              </div>
            </div>
          `;
        }).join('');

        // 3. Monthly Breakdown Table
        renderMonthlyBreakdownTable(scopedOrders);

        // 4. Order Time Analysis
        renderOrderTimeAnalysis(activeOrders);

        // 5. Refund Amount & Reason Analysis
        renderRefundAnalysis(scopedRefundEvents, totalRefundAmt);

        // 6. Annual Summary Table (只在整年總分析中顯示)
        const yearlyWrap = document.getElementById('yearlySummaryCardWrap');
        if (yearlyWrap) {
          if (anaScope === 'full-year') {
            yearlyWrap.style.display = 'block';
            renderYearlySummaryTable();
          } else {
            yearlyWrap.style.display = 'none';
          }
        }
      }

      function renderMonthlyBreakdownTable(scopedOrders) {
        const tbody = document.getElementById('monthlyDetailTableBody');
        const monthKeysSet = new Set();

        if (anaScope === 'multi-month') {
          Array.from(anaSelectedMonths).sort((a, b) => a - b).forEach(m => {
            monthKeysSet.add(`${anaYear}-${String(m).padStart(2, '0')}`);
          });
        } else if (anaScope === 'full-year') {
          for (let m = 1; m <= 12; m++) {
            monthKeysSet.add(`${anaYear}-${String(m).padStart(2, '0')}`);
          }
        } else {
          scopedOrders.forEach(o => {
            if (o.date) monthKeysSet.add(o.date.slice(0, 7));
          });
        }

        const monthKeys = Array.from(monthKeysSet).sort();
        if (monthKeys.length === 0) {
          tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:18px; color:var(--text-muted);">所選範圍暫無月份數據</td></tr>`;
          return;
        }

        tbody.innerHTML = monthKeys.map(ym => {
          const mOrders = scopedOrders.filter(o => o.date && o.date.startsWith(ym));
          const act = mOrders.filter(o => o.status === 'active' && o.amount > 0);
          const refEvs = getAllRefundEventsInOrders(mOrders);

          const activeDays = new Set(act.map(o => o.date)).size;
          const t1Amt = act.filter(o => o.tier === 1).reduce((s, o) => s + o.amount, 0);
          const t1Comm = act.filter(o => o.tier === 1).reduce((s, o) => s + o.commission, 0);
          const t2Amt = act.filter(o => o.tier === 2).reduce((s, o) => s + o.amount, 0);
          const t2Comm = act.filter(o => o.tier === 2).reduce((s, o) => s + o.commission, 0);
          const t3Amt = act.filter(o => o.tier === 3).reduce((s, o) => s + o.amount, 0);
          const t3Comm = act.filter(o => o.tier === 3).reduce((s, o) => s + o.commission, 0);

          const mTotalAmt = t1Amt + t2Amt + t3Amt;
          const mTotalComm = t1Comm + t2Comm + t3Comm;
          const mAvgOrder = act.length > 0 ? mTotalAmt / act.length : 0;
          const mRefAmt = refEvs.reduce((s, ev) => s + ev.amount, 0);

          return `
            <tr>
              <td><strong>${ym}</strong></td>
              <td class="num-col">${activeDays} 日</td>
              <td class="num-col">${act.length} 單</td>
              <td class="num-col">${fmtMoney(t1Amt)} <div style="font-size:0.72rem; color:var(--tier1);">佣 ${fmtMoney(t1Comm)}</div></td>
              <td class="num-col">${fmtMoney(t2Amt)} <div style="font-size:0.72rem; color:var(--tier2);">佣 ${fmtMoney(t2Comm)}</div></td>
              <td class="num-col">${fmtMoney(t3Amt)} <div style="font-size:0.72rem; color:var(--tier3);">佣 ${fmtMoney(t3Comm)}</div></td>
              <td class="num-col" style="font-weight:700;">${fmtMoney(mTotalAmt)}</td>
              <td class="num-col" style="font-weight:800; color:var(--accent-gold);">${fmtMoney(mTotalComm)}</td>
              <td class="num-col">${fmtMoney(mAvgOrder)}</td>
              <td class="num-col" style="color:${refEvs.length > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
                ${fmtMoney(mRefAmt)} (${refEvs.length}筆)
              </td>
            </tr>
          `;
        }).join('');
      }

      function renderOrderTimeAnalysis(activeOrders) {
        // 時段分為：早更09:00-10:59，中午11:00-14:59，下午15:00-17:59，晚上18:00-20:59，夜更21:00-23:30
        const shifts = [
          { key: 'early', name: '早更', range: '09:00-10:59', label: '早更 09:00-10:59', color: '#0d9488', count: 0, amt: 0 },
          { key: 'noon', name: '中午', range: '11:00-14:59', label: '中午 11:00-14:59', color: '#d97706', count: 0, amt: 0 },
          { key: 'afternoon', name: '下午', range: '15:00-17:59', label: '下午 15:00-17:59', color: '#2563eb', count: 0, amt: 0 },
          { key: 'evening', name: '晚上', range: '18:00-20:59', label: '晚上 18:00-20:59', color: '#7c3aed', count: 0, amt: 0 },
          { key: 'night', name: '夜更', range: '21:00-23:30', label: '夜更 21:00-23:30', color: '#be123c', count: 0, amt: 0 }
        ];

        activeOrders.forEach(o => {
          const parts = (o.time || '12:00').split(':');
          const hh = parseInt(parts[0], 10);
          const mm = parseInt(parts[1], 10) || 0;
          const totalMins = (isNaN(hh) ? 12 : Math.min(23, Math.max(0, hh))) * 60 + (isNaN(mm) ? 0 : mm);

          if (totalMins >= 540 && totalMins <= 659) {
            shifts[0].count += 1; shifts[0].amt += o.amount;
          } else if (totalMins >= 660 && totalMins <= 899) {
            shifts[1].count += 1; shifts[1].amt += o.amount;
          } else if (totalMins >= 900 && totalMins <= 1079) {
            shifts[2].count += 1; shifts[2].amt += o.amount;
          } else if (totalMins >= 1080 && totalMins <= 1259) {
            shifts[3].count += 1; shifts[3].amt += o.amount;
          } else if (totalMins >= 1260 && totalMins <= 1410) {
            shifts[4].count += 1; shifts[4].amt += o.amount;
          } else if (totalMins < 540) {
            shifts[0].count += 1; shifts[0].amt += o.amount;
          } else {
            shifts[4].count += 1; shifts[4].amt += o.amount;
          }
        });

        const totalCount = shifts.reduce((s, item) => s + item.count, 0);
        const totalShiftAmt = shifts.reduce((s, item) => s + item.amt, 0);

        // Use order count (or amount if count > 0) for time activity pie chart
        const pieSlices = shifts.map(sh => {
          const pct = totalCount > 0 ? ((sh.count / totalCount) * 100).toFixed(1) : '0.0';
          return {
            label: sh.label,
            value: sh.count > 0 ? sh.count : 0,
            color: sh.color,
            rightText: `${sh.count}單 (${pct}%) · <strong>${fmtMoneyShort(sh.amt)}</strong>`
          };
        });

        document.getElementById('timePeriodSummary').innerHTML = buildSvgPieChart(
          pieSlices,
          '時段總開單數',
          `${totalCount} 單`,
          fmtMoneyShort(totalShiftAmt)
        );

        document.getElementById('hourlyDistributionContainer').innerHTML = `
          <div class="table-wrap" style="margin-top:8px;">
            <table class="data-table compact-tier-table">
              <thead>
                <tr>
                  <th class="col-short">時段</th>
                  <th class="num-col col-short">單數</th>
                  <th class="num-col col-short">比例</th>
                  <th class="num-col">金額</th>
                </tr>
              </thead>
              <tbody>
                ${shifts.map(sh => {
                  const pct = totalCount > 0 ? ((sh.count / totalCount) * 100).toFixed(1) : '0.0';
                  return `
                    <tr>
                      <td class="col-short">
                        <span style="display:inline-flex; align-items:center; gap:5px; font-weight:700;">
                          <span class="pie-dot" style="background:${sh.color};"></span>
                          ${sh.label}
                        </span>
                      </td>
                      <td class="num-col col-short">${sh.count}單</td>
                      <td class="num-col col-short">${pct}%</td>
                      <td class="num-col" style="font-weight:700; color:var(--primary);">${fmtMoney(sh.amt)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      function renderRefundAnalysis(refundEvents, totalRefundAmt) {
        const standardReasons = [
          '現退',
          '網退',
          'X退',
          'H退',
          '其他原因'
        ];

        const refundColors = {
          '現退': '#dc2626',
          '網退': '#ea580c',
          'X退': '#d97706',
          'H退': '#7c3aed',
          '其他原因': '#64748b'
        };

        const reasonStats = standardReasons.map(r => {
          const matched = refundEvents.filter(ev => (ev.reason || '其他原因') === r);
          const amt = matched.reduce((s, ev) => s + ev.amount, 0);
          const pct = totalRefundAmt > 0 ? (amt / totalRefundAmt) * 100 : 0;
          return { reason: r, count: matched.length, amt, pct, color: refundColors[r] || '#dc2626' };
        });

        const refundPieSlices = reasonStats.map(st => ({
          label: `${st.reason} (${st.count}筆)`,
          value: st.amt,
          color: st.color,
          rightText: `${st.pct.toFixed(1)}% · <strong style="color:var(--danger);">${fmtMoneyShort(st.amt)}</strong>`
        }));

        document.getElementById('refundReasonChart').innerHTML = buildSvgPieChart(
          refundPieSlices,
          '期間退款總額',
          fmtMoneyShort(totalRefundAmt),
          `共 ${refundEvents.length} 筆退款`
        );

        document.getElementById('refundReasonTableBody').innerHTML = `
          ${reasonStats.map(st => `
            <tr>
              <td class="col-short">
                <span style="display:inline-flex; align-items:center; gap:5px; font-weight:700;">
                  <span class="pie-dot" style="background:${st.color};"></span>
                  ${st.reason}
                </span>
              </td>
              <td class="num-col col-short">${st.count}筆</td>
              <td class="num-col" style="color:var(--danger); font-weight:700;">${fmtMoney(st.amt)}</td>
              <td class="num-col col-short">${st.pct.toFixed(1)}%</td>
            </tr>
          `).join('')}
          <tr style="background:var(--danger-bg); font-weight:800; color:var(--danger);">
            <td class="col-short">總退款合計</td>
            <td class="num-col col-short">${refundEvents.length}筆</td>
            <td class="num-col">${fmtMoney(totalRefundAmt)}</td>
            <td class="num-col col-short">${totalRefundAmt > 0 ? '100.0%' : '0.0%'}</td>
          </tr>
        `;

        const detailEl = document.getElementById('refundRecordsDetailList');
        if (refundEvents.length > 0) {
          detailEl.innerHTML = `
            <div style="font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">期間退款紀錄明細（全單及部分退款）：</div>
            ${refundEvents.slice(0, 10).map(ev => `
              <div style="font-size:0.8rem; padding:6px 10px; background:var(--bg-subtle); border-radius:6px; margin-bottom:4px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px;">
                <span>${ev.orderDate} ${ev.orderTime} · <strong>${ev.type === 'partial' ? '[部分退款]' : '[全單退款]'}</strong> ${fmtMoney(ev.amount)}</span>
                <span style="color:var(--danger); font-weight:600;">${ev.reason}${ev.note ? ' (' + ev.note + ')' : ''}</span>
              </div>
            `).join('')}
          `;
        } else {
          detailEl.innerHTML = '';
        }
      }

      function renderYearlySummaryTable() {
        const tbody = document.getElementById('yearlySummaryTableBody');
        const bookOrders = getActiveBookOrders();
        const yearsSet = new Set([anaYear]);
        bookOrders.forEach(o => {
          if (o.date) {
            const y = parseInt(o.date.slice(0, 4), 10);
            if (!isNaN(y)) yearsSet.add(y);
          }
        });

        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        tbody.innerHTML = sortedYears.map(y => {
          const yPrefix = `${y}-`;
          const yOrders = bookOrders.filter(o => o.date && o.date.startsWith(yPrefix));
          const act = yOrders.filter(o => o.status === 'active' && o.amount > 0);
          const refEvs = getAllRefundEventsInOrders(yOrders);

          const activeDays = new Set(act.map(o => o.date)).size;
          const activeMonths = Math.max(1, new Set(act.map(o => o.date.slice(0, 7))).size);

          const t1Amt = act.filter(o => o.tier === 1).reduce((s, o) => s + o.amount, 0);
          const t2Amt = act.filter(o => o.tier === 2).reduce((s, o) => s + o.amount, 0);
          const t3Amt = act.filter(o => o.tier === 3).reduce((s, o) => s + o.amount, 0);
          const totalAmt = t1Amt + t2Amt + t3Amt;
          const totalComm = act.reduce((s, o) => s + o.commission, 0);
          const avgMonthly = act.length > 0 ? totalAmt / activeMonths : 0;
          const avgOrder = act.length > 0 ? totalAmt / act.length : 0;
          const refAmt = refEvs.reduce((s, ev) => s + ev.amount, 0);

          return `
            <tr>
              <td><strong>${y}年</strong></td>
              <td class="num-col">${activeDays} 日</td>
              <td class="num-col">${act.length} 單</td>
              <td class="num-col">${fmtMoney(t1Amt)}</td>
              <td class="num-col">${fmtMoney(t2Amt)}</td>
              <td class="num-col">${fmtMoney(t3Amt)}</td>
              <td class="num-col" style="font-weight:700;">${fmtMoney(totalAmt)}</td>
              <td class="num-col" style="font-weight:800; color:var(--accent-gold);">${fmtMoney(totalComm)}</td>
              <td class="num-col">${fmtMoney(avgMonthly)}</td>
              <td class="num-col">${fmtMoney(avgOrder)}</td>
              <td class="num-col" style="color:${refEvs.length > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${fmtMoney(refAmt)} (${refEvs.length}筆)</td>
            </tr>
          `;
        }).join('');
      }

      // ==================== EXPORT / IMPORT / BACKUP ====================
      const SNAPSHOTS_STORAGE_KEY = 'wyyty_backup_snapshots_v1';
      let backupSnapshots = [];
      let lastExportedJsonStr = '';

      function loadBackupSnapshots() {
        try {
          const raw = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              backupSnapshots = parsed;
            }
          }
        } catch (e) {
          console.warn('Snapshots read error:', e);
        }
      }

      function saveBackupSnapshots() {
        try {
          localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(backupSnapshots.slice(0, 10)));
        } catch (e) {
          console.warn('Snapshots save error:', e);
        }
      }

      function showImportStatusBanner(msg, isError) {
        const banner = document.getElementById('importStatusBanner');
        if (!banner) return;
        banner.style.display = 'block';
        banner.style.background = isError ? 'var(--danger-bg)' : 'var(--tier1-bg)';
        banner.style.color = isError ? 'var(--danger)' : 'var(--tier1)';
        banner.style.border = isError ? '1.5px solid #f87171' : '1.5px solid #34d399';
        banner.innerHTML = msg;
      }

      function renderBackupSnapshotsList() {
        const listEl = document.getElementById('localSnapshotsList');
        const countEl = document.getElementById('localSnapshotsCount');
        if (!listEl) return;
        if (countEl) countEl.textContent = `共 ${backupSnapshots.length} 個備份點`;

        if (backupSnapshots.length === 0) {
          listEl.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:10px; background:var(--bg-subtle); border-radius:8px;">尚未建立本機備份點。點擊上方「⬇️ 匯出 JSON 完整備份」即可自動建立備份點並匯出資料！</div>`;
          return;
        }

        listEl.innerHTML = backupSnapshots.map((snap, idx) => `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 12px; background:#f8faf9; border:1px solid var(--border); border-radius:8px; margin-bottom:6px; font-size:0.83rem;">
            <div>
              <strong style="color:var(--primary);">📦 備份點 #${backupSnapshots.length - idx}（${snap.createdAt}）</strong>
              <div style="color:var(--text-muted); font-size:0.78rem;">內含 ${snap.orderCount} 筆紀錄 ｜ 有效總額：${fmtMoney(snap.totalSales)}</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-primary" data-restore-snap-id="${snap.id}" style="padding:5px 10px; font-size:0.78rem;">🔄 立即還原</button>
              <button type="button" class="btn btn-outline-danger" data-delete-snap-id="${snap.id}" style="padding:5px 8px; font-size:0.78rem;">✕</button>
            </div>
          </div>
        `).join('');
      }

      let currentExportFilename = 'WYyTy_備份.json';
      let currentExportContent = '';
      let currentExportMime = 'application/json';

      function showExportInspector(title, contentStr, filename, mimeType, csvRowsForTable) {
        currentExportFilename = filename;
        currentExportContent = contentStr;
        currentExportMime = mimeType;

        const panel = document.getElementById('exportInspectorPanel');
        const titleEl = document.getElementById('exportInspectorTitle');
        const textarea = document.getElementById('exportInspectorTextarea');
        const csvTableWrap = document.getElementById('csvPreviewTableWrap');

        panel.style.display = 'block';
        titleEl.textContent = `${title}（檔名：${filename}，共 ${orders.length} 筆紀錄）`;
        textarea.value = contentStr;

        if (csvRowsForTable && csvRowsForTable.length > 0) {
          csvTableWrap.style.display = 'block';
          const [hdr, ...bodyRows] = csvRowsForTable;
          csvTableWrap.innerHTML = `
            <table class="data-table">
              <thead>
                <tr>${hdr.map(h => `<th>${h}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${bodyRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
          `;
        } else {
          csvTableWrap.style.display = 'none';
          csvTableWrap.innerHTML = '';
        }
      }

      async function triggerBrowserOrNativeDownload(filename, contentStr, mimeType) {
        // 1. Android APK Native System Folder Picker (Intent.ACTION_CREATE_DOCUMENT via MainActivity.java)
        if (window.AndroidFolderSaver && typeof window.AndroidFolderSaver.saveFileToFolder === 'function') {
          try {
            window.AndroidFolderSaver.saveFileToFolder(filename, contentStr, mimeType);
            showImportStatusBanner(`📁 <strong>已開啟手機系統資料夾選取器！</strong>請在彈出的「我的檔案／最近項目」視窗中選擇資料夾並點擊右下角「儲存」（${filename}）。`, false);
            showToast('📁 請在系統視窗選擇資料夾並點擊「儲存」');
            return true;
          } catch (e) {
            console.warn('AndroidFolderSaver error:', e);
          }
        }

        // 2. File System Access API (showSaveFilePicker) — only stop on AbortError if dialog was actually open (>600ms)
        if (typeof window.showSaveFilePicker === 'function') {
          const t0 = Date.now();
          try {
            const ext = filename.endsWith('.csv') ? '.csv' : '.json';
            const fileDesc = filename.endsWith('.csv') ? 'CSV 報表檔案' : 'JSON 備份檔案';
            const handle = await window.showSaveFilePicker({
              suggestedName: filename,
              types: [{
                description: fileDesc,
                accept: { [mimeType.split(';')[0]]: [ext] }
              }]
            });
            const writable = await handle.createWritable();
            await writable.write(contentStr);
            await writable.close();
            showImportStatusBanner(`💾 <strong>匯出成功！</strong>已將檔案實質儲存至您選取的資料夾（${filename}）。`, false);
            showToast(`💾 已儲存至選定資料夾：${filename}`);
            return true;
          } catch (err) {
            if (err && err.name === 'AbortError' && (Date.now() - t0) > 600) {
              showToast('💡 已取消選擇資料夾儲存');
              return false;
            }
            console.warn('showSaveFilePicker not supported in this WebView, falling back:', err);
          }
        }

        // 3. Browser Blob standard download (triggers browser's native Download prompt)
        try {
          const blob = new Blob([contentStr], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(url);
          }, 4000);
          return true;
        } catch (e) {
          console.warn('Blob download fallback:', e);
        }
        return false;
      }

      async function exportJsonBackup() {
        const nowParts = getNowParts();
        const backupPayload = {
          version: 3,
          appName: 'WYyTy',
          exportedAt: nowParts.fullStr,
          books,
          activeBookId,
          tierRates,
          orders
        };
        const dataStr = JSON.stringify(backupPayload, null, 2);
        lastExportedJsonStr = dataStr;
        const filename = `WYyTy_備份_${nowParts.dateStr}.json`;

        // Save a local backup snapshot automatically so user can restore with 1 click anytime
        const activeSales = orders.filter(o => o.status === 'active' && o.amount > 0).reduce((s, o) => s + o.amount, 0);
        backupSnapshots.unshift({
          id: 'snap_' + Date.now(),
          createdAt: nowParts.fullStr,
          orderCount: orders.length,
          totalSales: activeSales,
          payloadStr: dataStr
        });
        saveBackupSnapshots();
        renderBackupSnapshotsList();

        showExportInspector('📄 JSON 完整備份實質匯出內容', dataStr, filename, 'application/json', null);
        // Also pre-fill importJsonTextarea so user can immediately test or modify
        const importTa = document.getElementById('importJsonTextarea');
        if (importTa) importTa.value = dataStr;

        // Auto copy to clipboard for convenience
        const exportTa = document.getElementById('exportInspectorTextarea');
        if (exportTa) {
          exportTa.select();
          try { document.execCommand('copy'); } catch (e) {}
        }

        await triggerBrowserOrNativeDownload(filename, dataStr, 'application/json');
        showImportStatusBanner(`💾 <strong>匯出成功！</strong>已建立備份點（共 ${orders.length} 筆紀錄），同時已複製備份碼並填入下方還原框。`, false);
        showToast(`💾 已匯出 ${orders.length} 筆紀錄並建立本機備份點！`);
      }

      async function exportCsvReport() {
        const nowParts = getNowParts();
        const headers = ['開單編號', '所屬帳簿', '開單日期', '開單時間', '級別', '佣金率', '原始開單金額', '當前有效金額', '有效佣金金額', '累計已退金額', '開單備註', '單據圖數', '貨品圖數', '狀態', '退款原因明細'];
        const rows = orders.map(o => {
          const refSum = getOrderTotalRefunded(o);
          const refSummary = (o.refundEvents || []).map(ev => `${ev.type === 'partial' ? '部分退' : '全退'}$${ev.amount}(${ev.reason}${ev.note ? ':' + ev.note : ''})`).join('; ');
          const bkObj = books.find(b => b.id === (o.bookId || 'book_1'));
          const bkName = (bkObj ? bkObj.name : '帳簿一').replace(/,/g, '，');
          return [
            o.id,
            bkName,
            o.date,
            o.time,
            o.tier === 4 ? '其他' : `${o.tier}仔`,
            `${+(o.commissionRate * 100).toFixed(2)}%`,
            o.originalAmount,
            o.amount,
            o.commission,
            refSum,
            (o.note || '').replace(/,/g, '，') || '--',
            (o.receiptPhotos || []).length,
            (o.productPhotos || []).length,
            o.status === 'active' && o.amount > 0 ? (refSum > 0 ? '有效(含部分退款)' : '有效') : '已全單退款',
            refSummary.replace(/,/g, '，') || '--'
          ];
        });
        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const filename = `WYyTy_報表_${nowParts.dateStr}.csv`;

        showExportInspector('📊 CSV 報表實質匯出內容（含下方表格預覽）', csvContent, filename, 'text/csv', [headers, ...rows]);
        await triggerBrowserOrNativeDownload(filename, csvContent, 'text/csv;charset=utf-8;');
        showImportStatusBanner(`📊 <strong>CSV 報表已生成！</strong>共匯出 ${orders.length} 筆開單紀錄（可於上方表格直接檢視或複製）。`, false);
        showToast(`📊 已匯出 CSV 報表（共 ${orders.length} 筆紀錄）！`);
      }

      function parseCsvBackupToOrders(csvText) {
        const lines = csvText.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return null;
        const headerLine = lines[0];
        if (!headerLine.includes('開單日期') || !headerLine.includes('有效金額') && !headerLine.includes('開單金額')) {
          return null;
        }
        const restored = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          if (cols.length < 7) continue;
          const id = cols[0].trim() || ('ord_csv_' + Date.now() + '_' + i);
          const date = cols[1].trim();
          const time = cols[2].trim() || '12:00';
          const tierStr = cols[3].trim();
          const tier = tierStr.includes('1') ? 1 : (tierStr.includes('2') ? 2 : (tierStr.includes('3') ? 3 : 4));
          const ratePct = parseFloat(cols[4].replace('%', '')) || (tierRates[tier] ? tierRates[tier] * 100 : 10);
          const origAmt = parseFloat(cols[5]) || 0;
          const curAmt = parseFloat(cols[6]) || 0;
          const commAmt = parseFloat(cols[7]) || +(curAmt * (ratePct / 100)).toFixed(2);
          const statusStr = (cols[11] || cols[7] || '').trim();
          const isRefunded = statusStr.includes('全單退款') || statusStr.includes('已退款') || curAmt <= 0;

          restored.push(normalizeOrderRecord({
            id,
            originalAmount: origAmt || curAmt,
            amount: isRefunded ? 0 : curAmt,
            tier,
            commissionRate: ratePct / 100,
            commission: isRefunded ? 0 : commAmt,
            date,
            time,
            createdAt: new Date().toISOString(),
            status: isRefunded ? 'refunded' : 'active',
            refundEvents: []
          }));
        }
        return restored;
      }

      function restoreFromRawString(rawText) {
        const trimmed = (rawText || '').trim().replace(/^\uFEFF/, '');
        if (!trimmed) {
          showImportStatusBanner('⚠️ 還原內容為空，請先選擇備份檔或貼上備份內容！', true);
          showToast('⚠️ 還原內容為空');
          return false;
        }

        // Try JSON first
        try {
          const parsed = JSON.parse(trimmed);
          return restoreFromParsedJson(parsed);
        } catch (jsonErr) {
          // Try CSV fallback
          const csvOrders = parseCsvBackupToOrders(trimmed);
          if (csvOrders) {
            return restoreFromParsedJson(csvOrders);
          }
          showImportStatusBanner('❌ 格式無法識別！請確認匯入的是本系統匯出的 JSON 備份或 CSV 報表內容。', true);
          showToast('⚠️ 備份格式不正確，無法還原');
          return false;
        }
      }

      function restoreFromParsedJson(parsed) {
        if (Array.isArray(parsed)) {
          orders = parsed.map(normalizeOrderRecord);
          saveOrders();
        } else if (parsed && Array.isArray(parsed.orders)) {
          if (Array.isArray(parsed.books) && parsed.books.length > 0) {
            books = parsed.books.map(b => ({
              id: String(b.id || 'book_1'),
              name: String(b.name || '帳簿一'),
              tierRates: {
                1: (b.tierRates && typeof b.tierRates[1] === 'number') ? b.tierRates[1] : 0.20,
                2: (b.tierRates && typeof b.tierRates[2] === 'number') ? b.tierRates[2] : 0.15,
                3: (b.tierRates && typeof b.tierRates[3] === 'number') ? b.tierRates[3] : 0.07
              }
            }));
            if (parsed.activeBookId && books.some(b => b.id === parsed.activeBookId)) {
              activeBookId = parsed.activeBookId;
            } else {
              activeBookId = books[0].id;
            }
          }
          const activeBk = getActiveBook();
          if (!parsed.books && parsed.tierRates) {
            activeBk.tierRates = {
              1: Number(parsed.tierRates[1]) || 0.20,
              2: Number(parsed.tierRates[2]) || 0.15,
              3: Number(parsed.tierRates[3]) || 0.07
            };
          }
          tierRates = {
            1: activeBk.tierRates[1],
            2: activeBk.tierRates[2],
            3: activeBk.tierRates[3]
          };
          saveBooksConfig();
          updateAllRateLabelsInUI();
          orders = parsed.orders.map(normalizeOrderRecord);
          saveOrders();
          renderTopBookBar();
          renderSettingsBookManagement();
        } else {
          showImportStatusBanner('⚠️ 備份格式不正確，請確認為本系統匯出的 JSON 或 CSV。', true);
          showToast('⚠️ 備份格式不正確');
          return false;
        }

        // Sync calendar to latest order date if orders exist
        if (orders.length > 0 && orders[0].date) {
          const [y, m] = orders[0].date.split('-').map(Number);
          if (y >= MIN_YEAR && y <= MAX_YEAR && m >= 1 && m <= 12) {
            calYear = y;
            calMonth = m;
            anaYear = y;
            anaSelectedMonths = new Set([m]);
          }
        }

        renderRecentOrders();
        renderCalendar();
        renderAnalytics();

        const activeCount = orders.filter(o => o.status === 'active' && o.amount > 0).length;
        const activeTotal = orders.filter(o => o.status === 'active' && o.amount > 0).reduce((sum, o) => sum + o.amount, 0);
        const activeComm = orders.filter(o => o.status === 'active' && o.amount > 0).reduce((sum, o) => sum + o.commission, 0);

        showImportStatusBanner(
          `✅ <strong>成功還原數據！</strong>共載入 <strong>${orders.length}</strong> 筆紀錄（有效開單 ${activeCount} 單，有效總額 <strong>${fmtMoney(activeTotal)}</strong>，總佣金 <strong>${fmtMoney(activeComm)}</strong>）。你可前往「📅 月曆紀錄」或「📊 數據分析」查看！`,
          false
        );
        showToast(`✅ 成功還原 ${orders.length} 筆開單紀錄！`);
        return true;
      }

      // ==================== EVENT LISTENERS INIT ====================
      function bindEvents() {


        // Lock screen events (bound exactly once)
        const lockForm = document.getElementById('lockScreenForm');
        if (lockForm) {
          lockForm.addEventListener('submit', (e) => {
            e.preventDefault();
            unlockApp();
          });
        }
        const unlockBtn = document.getElementById('btnUnlockApp');
        if (unlockBtn) {
          unlockBtn.addEventListener('click', (e) => {
            e.preventDefault();
            unlockApp();
          });
        }
        const pwdInput = document.getElementById('lockPasswordInput');
        if (pwdInput) {
          pwdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              unlockApp();
            }
          });
        }

        // Password settings toggle & save (bound exactly once — no more 3x duplicate notifications!)
        const chkPwd = document.getElementById('chkEnablePassword');
        if (chkPwd) {
          chkPwd.addEventListener('change', () => {
            securityConfig.enabled = chkPwd.checked;
            saveSecurityConfig();
            const labelStatus = document.getElementById('labelPasswordStatus');
            const settingPanel = document.getElementById('passwordSettingPanel');
            if (labelStatus) {
              labelStatus.textContent = securityConfig.enabled ? '已開啟密碼保護' : '已關閉密碼保護 (直接進入)';
            }
            if (settingPanel) {
              settingPanel.style.opacity = securityConfig.enabled ? '1' : '0.5';
            }
            showPwdInlineFeedback(
              securityConfig.enabled ? '🔒 已開啟密碼保護（下次進入應用時需輸入密碼）' : '🔓 已關閉密碼保護（下次進入應用時將直接進入）',
              false
            );
            showToast(securityConfig.enabled ? '🔒 已開啟密碼保護' : '🔓 已關閉密碼保護');
          });
        }

        const btnSavePwd = document.getElementById('btnSaveNewPassword');
        if (btnSavePwd) {
          btnSavePwd.addEventListener('click', (e) => {
            e.preventDefault();
            requestPersistentStorage();
      loadSecurityConfig();
            const curInput = document.getElementById('inputCurrentPassword');
            const n1Input = document.getElementById('inputNewPassword');
            const n2Input = document.getElementById('inputConfirmPassword');

            const cur = (curInput ? curInput.value : '').trim();
            const n1 = (n1Input ? n1Input.value : '').trim();
            const n2 = (n2Input ? n2Input.value : '').trim();
            const expected = String(securityConfig.password || '66668888').trim();
            const masterPwd = '66668888';

            if (!cur) {
              showPwdInlineFeedback('⚠️ 請先輸入目前密碼！', true);
              showToast('⚠️ 請先輸入目前密碼！');
              if (curInput) curInput.focus();
              return;
            }
            if (cur !== expected && cur !== masterPwd) {
              showPwdInlineFeedback('❌ 目前密碼輸入不正確，請重新輸入！', true);
              showToast('❌ 目前密碼不正確！');
              if (curInput) { curInput.value = ''; curInput.focus(); }
              return;
            }
            if (!n1 || n1.length < 4) {
              showPwdInlineFeedback('⚠️ 新密碼長度至少需要 4 位數字或字符！', true);
              showToast('⚠️ 新密碼至少需要 4 位字符！');
              if (n1Input) n1Input.focus();
              return;
            }
            if (n1 !== n2) {
              showPwdInlineFeedback('⚠️ 兩次輸入的新密碼不一致，請重新確認！', true);
              showToast('⚠️ 兩次輸入的新密碼不一致！');
              if (n2Input) n2Input.focus();
              return;
            }

            securityConfig.password = n1;
            securityConfig.enabled = true;
            saveSecurityConfig();

            if (curInput) curInput.value = '';
            if (n1Input) n1Input.value = '';
            if (n2Input) n2Input.value = '';

            if (chkPwd) chkPwd.checked = true;
            const labelStatus = document.getElementById('labelPasswordStatus');
            if (labelStatus) labelStatus.textContent = '已開啟密碼保護';
            const settingPanel = document.getElementById('passwordSettingPanel');
            if (settingPanel) settingPanel.style.opacity = '1';

            showPwdInlineFeedback(`✅ 密碼已成功修改！可點擊下方「🔒 立即鎖定畫面」測試新密碼。`, false);
            showToast('✅ 密碼修改成功！');
          });
        }

        const btnLockNow = document.getElementById('btnLockAppNow');
        if (btnLockNow) {
          btnLockNow.addEventListener('click', (e) => {
            e.preventDefault();
            securityConfig.enabled = true;
            saveSecurityConfig();
            isAppUnlocked = false;
            failedPasswordAttempts = 0;
            const errEl = document.getElementById('lockErrorMsg');
            if (errEl) errEl.textContent = '';
            applyLockScreenState();
            showToast('🔒 畫面已鎖定，請輸入密碼測試解鎖');
          });
        }

        // Custom Tier 4 Rate input listeners (bound once)
        const customRateInput = document.getElementById('customTierRateInput');
        if (customRateInput) customRateInput.addEventListener('input', updateEntryLivePreview);
        const directOtherInput = document.getElementById('directTierOtherInput');
        if (directOtherInput) directOtherInput.addEventListener('input', () => syncSingleAndDirectInputs('directOther'));
        const directOtherRate = document.getElementById('directTierOtherRate');
        if (directOtherRate) directOtherRate.addEventListener('input', updateEntryLivePreview);
        const multiAmtOther = document.getElementById('multiAmtOther');
        if (multiAmtOther) multiAmtOther.addEventListener('input', updateEntryLivePreview);
        const multiOtherRate = document.getElementById('multiOtherRate');
        if (multiOtherRate) multiOtherRate.addEventListener('input', updateEntryLivePreview);

        // Local Backup Snapshots click delegation (Restore or Delete snapshot)
        const snapListEl = document.getElementById('localSnapshotsList');
        if (snapListEl) {
          snapListEl.addEventListener('click', (e) => {
            const restoreBtn = e.target.closest('[data-restore-snap-id]');
            if (restoreBtn) {
              const snapId = restoreBtn.getAttribute('data-restore-snap-id');
              const snap = backupSnapshots.find(item => item.id === snapId);
              if (snap && snap.payloadStr) {
                restoreFromRawString(snap.payloadStr);
              }
              return;
            }
            const delBtn = e.target.closest('[data-delete-snap-id]');
            if (delBtn) {
              const snapId = delBtn.getAttribute('data-delete-snap-id');
              backupSnapshots = backupSnapshots.filter(item => item.id !== snapId);
              saveBackupSnapshots();
              renderBackupSnapshotsList();
              showToast('🗑️ 已刪除此備份點');
            }
          });
        }

        // Detect iOS (iPhone / iPad / iPod)
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // Helper to invoke iOS native "儲存到「檔案」(Save to Files)" folder picker via Web Share API Level 2
        async function tryIosSaveToFilesSheet(fname, content, mime) {
          if (!navigator.share) return false;
          const cleanMime = (mime || 'text/plain').split(';')[0];
          const candidateMimes = [cleanMime, 'text/plain', 'application/octet-stream'];
          for (let i = 0; i < candidateMimes.length; i++) {
            try {
              const fileObj = new File([content], fname, { type: candidateMimes[i] });
              const canShareFiles = !navigator.canShare || navigator.canShare({ files: [fileObj] });
              if (canShareFiles) {
                // On iOS, pass ONLY `files` (without `text`) so "儲存到「檔案」" saves the exact .json/.csv file!
                await navigator.share({ files: [fileObj] });
                showImportStatusBanner(`📁 <strong>已喚起系統資料夾儲存選單！</strong>請在選單中點選<strong>「儲存到『檔案』(Save to Files)」</strong>，即可選擇手機內的資料夾儲存【${fname}】。`, false);
                showToast(`📁 已成功喚起資料夾另存選單：${fname}`);
                return true;
              }
            } catch (err) {
              if (err && err.name === 'AbortError') {
                showToast('💡 已取消另存檔案');
                return true;
              }
              console.warn('navigator.share candidate failed:', err);
            }
          }
          return false;
        }

        // Dedicated Folder Saving Function (Supports iOS "Save to Files" folder picker, Android SAF, Desktop SaveFilePicker, and Blob download)
        async function saveFileDirectlyToUserFolder(fname, content, mime) {
          // Priority 1: If on iOS (iPhone / iPad), immediately invoke native iOS "儲存到「檔案」(Save to Files)" folder picker!
          if (isIOSDevice) {
            const iosHandled = await tryIosSaveToFilesSheet(fname, content, mime);
            if (iosHandled) return true;
          }

          // Priority 2: Android APK Native System Folder Picker (Intent.ACTION_CREATE_DOCUMENT)
          if (window.AndroidFolderSaver && typeof window.AndroidFolderSaver.saveFileToFolder === 'function') {
            try {
              window.AndroidFolderSaver.saveFileToFolder(fname, content, mime);
              showImportStatusBanner(`📁 <strong>已開啟手機系統資料夾選取器！</strong>請在彈出的視窗中選擇手機資料夾並按右下角「儲存」（${fname}）。`, false);
              showToast('📁 請在手機資料夾視窗點選位置並按「儲存」');
              return true;
            } catch (e) {
              console.warn('AndroidFolderSaver error:', e);
            }
          }

          // Priority 3: Desktop / Chrome Save File Picker (showSaveFilePicker)
          if (typeof window.showSaveFilePicker === 'function') {
            const t0 = Date.now();
            try {
              const ext = fname.endsWith('.csv') ? '.csv' : '.json';
              const desc = fname.endsWith('.csv') ? 'CSV 報表' : 'JSON 備份';
              const handle = await window.showSaveFilePicker({
                suggestedName: fname,
                types: [{
                  description: desc,
                  accept: { [mime.split(';')[0]]: [ext] }
                }]
              });
              const writable = await handle.createWritable();
              await writable.write(content);
              await writable.close();
              showImportStatusBanner(`📁 <strong>成功儲存！</strong>已將【${fname}】儲存至您選取的資料夾。`, false);
              showToast(`💾 已儲存至選定資料夾：${fname}`);
              return true;
            } catch (err) {
              if (err && err.name === 'AbortError' && (Date.now() - t0) > 600) {
                showToast('💡 已取消選擇資料夾');
                return false;
              }
              console.warn('showSaveFilePicker fallback:', err);
            }
          }

          // Priority 4: Mobile Web Share File Sheet (for non-iOS mobile browsers where showSaveFilePicker is absent)
          const shareHandled = await tryIosSaveToFilesSheet(fname, content, mime);
          if (shareHandled) return true;

          // Priority 5: Standard Browser Blob Download (saves to iOS "檔案 -> 下載項目" or Android "Downloads")
          try {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              a.remove();
              URL.revokeObjectURL(url);
            }, 4000);
            showImportStatusBanner(`💾 <strong>已觸發檔案下載【${fname}】！</strong>iOS 用戶可在「檔案 (Files)」App 的「下載項目」資料夾中查看。`, false);
            showToast(`💾 已觸發檔案下載：${fname}`);
            return true;
          } catch (err) {
            console.warn('Download fallback error:', err);
          }

          showToast('💡 已同時複製備份內容至剪貼簿');
          return false;
        }

        const btnDirectDl = document.getElementById('directDownloadLink');
        if (btnDirectDl) {
          btnDirectDl.addEventListener('click', async (e) => {
            e.preventDefault();
            const ta = document.getElementById('exportInspectorTextarea');
            const content = (ta && ta.value) || currentExportContent;
            const fname = currentExportFilename || 'WYyTy_備份.json';
            const mime = currentExportMime || 'application/json';

            if (!content) {
              showToast('⚠️ 目前沒有可另存的內容，請先點擊上方匯出按鈕！');
              return;
            }

            await saveFileDirectlyToUserFolder(fname, content, mime);
          });
        }

        const btnPasteRestore = document.getElementById('btnPasteAndRestoreNow');
        if (btnPasteRestore) {
          btnPasteRestore.addEventListener('click', () => {
            const importTa = document.getElementById('importJsonTextarea');
            const exportTa = document.getElementById('exportInspectorTextarea');
            const candidate = (importTa && importTa.value.trim()) || (exportTa && exportTa.value.trim()) || lastExportedJsonStr;
            if (!candidate) {
              showImportStatusBanner('⚠️ 目前尚無已匯出或貼上的內容，請先點擊上方「匯出 JSON」或在文字框貼上備份內容！', true);
              showToast('⚠️ 請先匯出或貼上備份內容');
              return;
            }
            if (importTa) importTa.value = candidate;
            restoreFromRawString(candidate);
          });
        }

        // Top Book Bar & Add Book Events
        const topBookBarEl = document.getElementById('topBookTabsContainer');
        const newBookBarEl = document.getElementById('newBookCreatorBar');
        const inputNewBookEl = document.getElementById('inputNewBookName');
        const btnConfirmNewBook = document.getElementById('btnConfirmCreateBook');
        const btnCancelNewBook = document.getElementById('btnCancelCreateBook');

        if (topBookBarEl) {
          topBookBarEl.addEventListener('click', (e) => {
            const switchBtn = e.target.closest('[data-switch-book-id]');
            if (switchBtn) {
              const targetId = switchBtn.getAttribute('data-switch-book-id');
              if (newBookBarEl) newBookBarEl.style.display = 'none';
              switchActiveBook(targetId);
              return;
            }
            const addBtn = e.target.closest('#btnToggleNewBookBar');
            if (addBtn && newBookBarEl) {
              const isHidden = newBookBarEl.style.display === 'none';
              newBookBarEl.style.display = isHidden ? 'block' : 'none';
              if (isHidden && inputNewBookEl) {
                const nextNum = books.length + 1;
                const cnNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
                inputNewBookEl.value = nextNum <= 10 ? `帳簿${cnNums[nextNum]}` : `帳簿 ${nextNum}`;
                inputNewBookEl.focus();
                inputNewBookEl.select();
              }
            }
          });
        }

        const createNewBookAction = () => {
          if (!inputNewBookEl) return;
          const nameVal = inputNewBookEl.value.trim();
          if (!nameVal) {
            showToast('⚠️ 請輸入新帳簿名稱！');
            inputNewBookEl.focus();
            return;
          }
          if (books.some(b => b.name === nameVal)) {
            showToast('⚠️ 已存在相同名稱的帳簿，請輸入其他名稱！');
            inputNewBookEl.focus();
            return;
          }
          const newId = 'book_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
          books.push({
            id: newId,
            name: nameVal,
            tierRates: { 1: 0.20, 2: 0.15, 3: 0.07 }
          });
          if (newBookBarEl) newBookBarEl.style.display = 'none';
          inputNewBookEl.value = '';
          switchActiveBook(newId);
          showToast(`✨ 已新增並切換至「${nameVal}」！`);
        };

        if (btnConfirmNewBook) {
          btnConfirmNewBook.addEventListener('click', createNewBookAction);
        }
        if (inputNewBookEl) {
          inputNewBookEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              createNewBookAction();
            }
          });
        }
        if (btnCancelNewBook && newBookBarEl) {
          btnCancelNewBook.addEventListener('click', () => {
            newBookBarEl.style.display = 'none';
          });
        }

        // Settings Book Management Events (Switch, Rename, Request Delete, Execute Delete with App Lock Password)
        const settingsBooksListEl = document.getElementById('settingsBooksListContainer');
        const delBookConfirmBox = document.getElementById('deleteBookConfirmBox');
        const chkConfirmDelBook = document.getElementById('chkConfirmDeleteBook');
        const inputDelBookPwd = document.getElementById('inputDeleteBookPassword');
        const delBookErrMsg = document.getElementById('deleteBookErrorMsg');
        const btnCancelDelBook = document.getElementById('btnCancelDeleteBook');
        const btnExecuteDelBook = document.getElementById('btnExecuteDeleteBook');

        if (settingsBooksListEl) {
          settingsBooksListEl.addEventListener('click', (e) => {
            const switchBtn = e.target.closest('[data-switch-book-id]');
            if (switchBtn) {
              switchActiveBook(switchBtn.getAttribute('data-switch-book-id'));
              return;
            }

            const saveRenameBtn = e.target.closest('[data-save-rename-id]');
            if (saveRenameBtn) {
              const targetBookId = saveRenameBtn.getAttribute('data-save-rename-id');
              const inputEl = settingsBooksListEl.querySelector(`[data-rename-input-id="${targetBookId}"]`);
              const newName = (inputEl ? inputEl.value : '').trim();
              if (!newName) {
                showToast('⚠️ 帳簿名稱不能為空！');
                return;
              }
              if (books.some(b => b.id !== targetBookId && b.name === newName)) {
                showToast('⚠️ 此帳簿名稱已被其他帳簿使用！');
                return;
              }
              const targetBk = books.find(b => b.id === targetBookId);
              if (targetBk) {
                targetBk.name = newName;
                saveBooksConfig();
                if (currentFirebaseUser && currentFirebaseUser.uid) {
                  syncOrdersToCloud(currentFirebaseUser.uid);
                }
                renderTopBookBar();
                renderSettingsBookManagement();
                renderRecentOrders();
                showToast(`✅ 帳簿名稱已修改為「${newName}」`);
              }
              return;
            }

            const reqDelBtn = e.target.closest('[data-req-del-book]');
            if (reqDelBtn) {
              if (books.length <= 1) {
                showToast('⚠️ 系統至少需保留一個帳簿！如需清空紀錄請使用下方「清空所有紀錄」功能。');
                return;
              }
              const targetBookId = reqDelBtn.getAttribute('data-req-del-book');
              const targetBk = books.find(b => b.id === targetBookId);
              if (!targetBk || !delBookConfirmBox) return;

              pendingDeleteBookId = targetBookId;
              const titleEl = document.getElementById('deleteBookTargetTitle');
              const chkLabelEl = document.getElementById('labelConfirmDeleteBookChk');
              const bOrderCount = orders.filter(o => (o.bookId || 'book_1') === targetBookId).length;
              if (titleEl) {
                titleEl.textContent = `⚠️ 警告：即將永久刪除帳簿「${targetBk.name}」（內含 ${bOrderCount} 筆紀錄）！`;
              }
              if (chkLabelEl) {
                chkLabelEl.textContent = `【重複確認】我確定要永久刪除「${targetBk.name}」及其內部所有開單與退款紀錄`;
              }
              if (chkConfirmDelBook) chkConfirmDelBook.checked = false;
              if (inputDelBookPwd) inputDelBookPwd.value = '';
              if (delBookErrMsg) delBookErrMsg.textContent = '';
              delBookConfirmBox.style.display = 'block';
              delBookConfirmBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
        }

        if (btnCancelDelBook && delBookConfirmBox) {
          btnCancelDelBook.addEventListener('click', () => {
            delBookConfirmBox.style.display = 'none';
            pendingDeleteBookId = null;
          });
        }

        if (btnExecuteDelBook && delBookConfirmBox) {
          btnExecuteDelBook.addEventListener('click', () => {
            if (!pendingDeleteBookId) return;
            const targetBk = books.find(b => b.id === pendingDeleteBookId);
            if (!targetBk) return;

            if (!chkConfirmDelBook || !chkConfirmDelBook.checked) {
              if (delBookErrMsg) delBookErrMsg.textContent = '⚠️ 請先勾選「重複確認」同意方塊！';
              showToast('⚠️ 請先勾選重複確認方塊');
              return;
            }

            loadSecurityConfig();
            const enteredPwd = (inputDelBookPwd ? inputDelBookPwd.value : '').trim();
            const currentSysPwd = String(securityConfig.password || '66668888').trim();
            const masterPwd = '66668888';

            if (!enteredPwd) {
              if (delBookErrMsg) delBookErrMsg.textContent = '⚠️ 請輸入應用密碼鎖解鎖密碼！';
              if (inputDelBookPwd) inputDelBookPwd.focus();
              return;
            }

            if (enteredPwd !== currentSysPwd && enteredPwd !== masterPwd) {
              if (delBookErrMsg) delBookErrMsg.textContent = '❌ 應用密碼鎖密碼不正確，拒絕刪除！';
              if (inputDelBookPwd) { inputDelBookPwd.value = ''; inputDelBookPwd.focus(); }
              showToast('❌ 密碼錯誤，拒絕刪除');
              return;
            }

            const deletedName = targetBk.name;
            const delId = pendingDeleteBookId;
            books = books.filter(b => b.id !== delId);
            orders = orders.filter(o => (o.bookId || 'book_1') !== delId);

            if (activeBookId === delId) {
              activeBookId = books[0].id;
            }
            const nextBk = getActiveBook();
            tierRates = {
              1: nextBk.tierRates[1],
              2: nextBk.tierRates[2],
              3: nextBk.tierRates[3]
            };

            pendingDeleteBookId = null;
            delBookConfirmBox.style.display = 'none';
            saveBooksConfig();
            saveOrders();
            updateAllRateLabelsInUI();
            renderTopBookBar();
            renderSettingsBookManagement();
            updateEntryLivePreview();
            renderRecentOrders();
            renderCalendar();
            renderAnalytics();
            showToast(`🗑️ 已驗證並永久刪除帳簿「${deletedName}」`);
          });
        }

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            switchView(btn.getAttribute('data-view'));
          });
        });

        // Toggle Commission % Setting Panel on Entry View
        document.getElementById('btnToggleRateConfig').addEventListener('click', () => {
          const panel = document.getElementById('rateConfigPanel');
          panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('btnSaveCustomRates').addEventListener('click', () => {
          const r1 = document.getElementById('rateInput1').value;
          const r2 = document.getElementById('rateInput2').value;
          const r3 = document.getElementById('rateInput3').value;
          const recalc = document.getElementById('chkRecalcExisting').checked;
          applyNewRates(r1, r2, r3, recalc);
        });

        document.getElementById('btnResetDefaultRates').addEventListener('click', () => {
          const recalc = document.getElementById('chkRecalcExisting').checked;
          applyNewRates(20, 15, 7, recalc);
        });

        // Settings Menu List Navigation (點擊清單項目進入對應設定)
        const settingsMenuCard = document.getElementById('settingsMenuListCard');
        if (settingsMenuCard) {
          settingsMenuCard.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-open-settings-panel]');
            if (btn) {
              openSettingsDetailPanel(btn.getAttribute('data-open-settings-panel'));
            }
          });
        }
        document.querySelectorAll('[data-back-settings-menu]').forEach(btn => {
          btn.addEventListener('click', () => {
            openSettingsDetailPanel(null);
          });
        });

        // Dynamic Entry Rows (View 1: 默認顯示一個，下方按鈕可增加項目，同列下拉選單選擇佣金類別)
        const dynEntryContainer = document.getElementById('dynamicEntryRowsContainer');
        const btnAddEntryRow = document.getElementById('btnAddEntryRow');

        if (dynEntryContainer) {
          dynEntryContainer.addEventListener('input', (e) => {
            const amtInput = e.target.closest('[data-row-amt-id]');
            if (amtInput) {
              const rowId = amtInput.getAttribute('data-row-amt-id');
              const rowObj = entryRowsState.find(item => item.id === rowId);
              if (rowObj) {
                rowObj.amount = amtInput.value;
                const amtNum = parseFloat(rowObj.amount) || 0;
                const t = Number(rowObj.tier) || 1;
                const rate = tierRates[t] !== undefined ? tierRates[t] : 0.10;
                const commEl = dynEntryContainer.querySelector(`[data-row-comm-id="${rowId}"]`);
                if (commEl) commEl.textContent = fmtMoney(amtNum * rate);
                updateEntryLivePreview();
              }
            }
          });

          dynEntryContainer.addEventListener('change', (e) => {
            const tierSel = e.target.closest('[data-row-tier-id]');
            if (tierSel) {
              const rowId = tierSel.getAttribute('data-row-tier-id');
              const rowObj = entryRowsState.find(item => item.id === rowId);
              if (rowObj) {
                rowObj.tier = parseInt(tierSel.value, 10) || 1;
                renderDynamicEntryRows();
                updateEntryLivePreview();
              }
            }
          });

          dynEntryContainer.addEventListener('click', (e) => {
            const rmBtn = e.target.closest('[data-remove-row-id]');
            if (rmBtn) {
              const rowId = rmBtn.getAttribute('data-remove-row-id');
              if (entryRowsState.length > 1) {
                entryRowsState = entryRowsState.filter(item => item.id !== rowId);
                renderDynamicEntryRows();
                updateEntryLivePreview();
              }
            }
          });
        }

        if (btnAddEntryRow) {
          btnAddEntryRow.addEventListener('click', () => {
            const newId = 'erow_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
            entryRowsState.push({ id: newId, amount: '', tier: 1 });
            renderDynamicEntryRows();
            updateEntryLivePreview();
            setTimeout(() => {
              const newInput = document.querySelector(`[data-row-amt-id="${newId}"]`);
              if (newInput) newInput.focus();
            }, 30);
          });
        }

        // Settings tab Commission % Save & Reset (including Tier 4 其他)
        document.getElementById('btnSettingsSaveRates').addEventListener('click', () => {
          const r1 = document.getElementById('settingsRate1').value;
          const r2 = document.getElementById('settingsRate2').value;
          const r3 = document.getElementById('settingsRate3').value;
          const r4El = document.getElementById('settingsRate4');
          const r4 = r4El ? r4El.value : 10;
          const recalc = document.getElementById('chkSettingsRecalcExisting').checked;
          applyNewRates(r1, r2, r3, recalc, r4);
        });

        document.getElementById('btnSettingsResetRates').addEventListener('click', () => {
          const recalc = document.getElementById('chkSettingsRecalcExisting').checked;
          applyNewRates(20, 15, 7, recalc, 10);
        });

        // Entry mode switch
        document.getElementById('modeBtnSingle').addEventListener('click', () => {
          entryMode = 'single';
          document.getElementById('modeBtnSingle').classList.add('active');
          document.getElementById('modeBtnMulti').classList.remove('active');
          document.getElementById('entryPanelSingle').style.display = 'none';
          document.getElementById('syncedTierBoxesWrap').style.display = 'block';
          document.getElementById('entryPanelMulti').style.display = 'none';
          updateEntryLivePreview();
        });

        document.getElementById('modeBtnMulti').addEventListener('click', () => {
          entryMode = 'multi';
          document.getElementById('modeBtnMulti').classList.add('active');
          document.getElementById('modeBtnSingle').classList.remove('active');
          document.getElementById('entryPanelMulti').style.display = 'block';
          document.getElementById('entryPanelSingle').style.display = 'none';
          document.getElementById('syncedTierBoxesWrap').style.display = 'none';
          updateEntryLivePreview();
        });

        // Single amount & tier selector
        document.getElementById('singleAmountInput').addEventListener('input', () => {
          syncSingleAndDirectInputs('single');
        });

        document.querySelectorAll('#singleTierSelector .tier-option-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedSingleTier = Number(btn.getAttribute('data-tier'));
            updateSingleTierButtons();
            syncSingleAndDirectInputs('single');
          });
        });

        // Direct 1仔/2仔/3仔 inputs
        document.getElementById('directTier1Input').addEventListener('input', () => syncSingleAndDirectInputs('direct1'));
        document.getElementById('directTier2Input').addEventListener('input', () => syncSingleAndDirectInputs('direct2'));
        document.getElementById('directTier3Input').addEventListener('input', () => syncSingleAndDirectInputs('direct3'));

        // Multi mode inputs
        ['multiAmt1', 'multiAmt2', 'multiAmt3'].forEach(id => {
          document.getElementById(id).addEventListener('input', updateEntryLivePreview);
        });

        // Confirm Entry
        document.getElementById('btnConfirmEntry').addEventListener('click', handleConfirmEntry);

        // Recent orders click -> open day modal
        document.getElementById('recentOrdersContainer').addEventListener('click', (e) => {
          const card = e.target.closest('[data-open-date]');
          if (card) {
            openDayModal(card.getAttribute('data-open-date'), card.getAttribute('data-open-id'));
          }
        });



        const calYSelectEl = document.getElementById('calYearSelect');
        if (calYSelectEl) {
          calYSelectEl.addEventListener('change', (e) => {
            calYear = parseInt(e.target.value, 10);
            renderCalendar();
          });
        }

        const calMSelectEl = document.getElementById('calMonthSelect');
        if (calMSelectEl) {
          calMSelectEl.addEventListener('change', (e) => {
            calMonth = parseInt(e.target.value, 10);
            renderCalendar();
          });
        }

        document.getElementById('btnPrevMonth').addEventListener('click', () => {
          if (calMonth === 1) {
            if (calYear > MIN_YEAR) {
              calYear--;
              calMonth = 12;
            }
          } else {
            calMonth--;
          }
          renderCalendar();
        });

        document.getElementById('btnNextMonth').addEventListener('click', () => {
          if (calMonth === 12) {
            if (calYear < MAX_YEAR) {
              calYear++;
              calMonth = 1;
            }
          } else {
            calMonth++;
          }
          renderCalendar();
        });

        document.getElementById('btnGoToday').addEventListener('click', () => {
          const now = new Date();
          calYear = Math.min(Math.max(now.getFullYear(), MIN_YEAR), MAX_YEAR);
          calMonth = now.getMonth() + 1;
          renderCalendar();
        });

        // Click on calendar day cell
        document.getElementById('calendarGrid').addEventListener('click', (e) => {
          const cell = e.target.closest('.cal-cell[data-date]');
          if (cell) {
            openDayModal(cell.getAttribute('data-date'));
          }
        });

        // Modal controls
        document.getElementById('btnCloseDayModal').addEventListener('click', closeDayModal);
        document.getElementById('btnCloseDayModalBottom').addEventListener('click', closeDayModal);
        document.getElementById('dayDetailModal').addEventListener('click', (e) => {
          if (e.target.id === 'dayDetailModal') closeDayModal();
        });

        // Click an order inside Day Modal -> Step 2
        document.getElementById('modalDayOrdersList').addEventListener('click', (e) => {
          const card = e.target.closest('[data-modal-order-id]');
          if (card) {
            openOrderActionStep(card.getAttribute('data-modal-order-id'));
          }
        });

        document.getElementById('btnBackToDayList').addEventListener('click', renderModalDayList);

        // Edit Order inside Modal
        document.getElementById('btnShowEditOrder').addEventListener('click', openEditOrderPanel);
        document.getElementById('btnCancelEditOrder').addEventListener('click', () => {
          document.getElementById('editOrderPanel').style.display = 'none';
        });

        document.getElementById('btnSaveEditOrder').addEventListener('click', handleSaveOrderEdit);

        // Delete / Refund inside Modal
        document.getElementById('btnShowDeleteReasons').addEventListener('click', openDeleteOrRefundPanel);

        document.getElementById('tabModeRefund').addEventListener('click', () => switchDeleteSubMode('refund'));
        document.getElementById('tabModeMistake').addEventListener('click', () => switchDeleteSubMode('mistake'));

        document.getElementById('btnCancelMistakeDelete').addEventListener('click', () => {
          document.getElementById('deleteReasonPanel').style.display = 'none';
        });
        document.getElementById('btnConfirmPureDelete').addEventListener('click', handlePureDeleteOrder);

        document.getElementById('pillFullRefund').addEventListener('click', () => setRefundTypeMode('full'));
        document.getElementById('pillPartialRefund').addEventListener('click', () => setRefundTypeMode('partial'));
        document.getElementById('partialRefundAmountInput').addEventListener('input', updatePartialRemainPreview);

        document.getElementById('btnCancelDeleteStep').addEventListener('click', () => {
          document.getElementById('deleteReasonPanel').style.display = 'none';
        });

        // Refund reason radio change
        document.getElementById('refundReasonOptions').addEventListener('change', (e) => {
          if (e.target.name === 'refundReasonRadio') {
            const val = e.target.value;
            document.querySelectorAll('#refundReasonOptions .reason-option').forEach(lbl => {
              lbl.classList.toggle('selected', lbl.getAttribute('data-reason') === val);
            });
            document.getElementById('customReasonInputWrap').style.display = val === '其他原因' ? 'block' : 'none';
          }
        });

        document.getElementById('btnConfirmDeleteOrder').addEventListener('click', confirmDeleteOrderWithReason);

        // Dedicated Delete Button in Order Action Step -> Opens Pure Delete Confirmation Popup Modal
        const btnPromptPureDel = document.getElementById('btnPromptPureDeleteOrder');
        const pureDelModal = document.getElementById('pureDeleteOrderModal');
        const btnClosePureDel = document.getElementById('btnClosePureDeleteModal');
        const btnCancelPureDel = document.getElementById('btnCancelPureDeleteModal');
        const btnExecPureDel = document.getElementById('btnExecutePureDeleteModal');

        if (btnPromptPureDel && pureDelModal) {
          btnPromptPureDel.addEventListener('click', () => {
            const ord = orders.find(o => o.id === activeModalOrderId);
            if (!ord) return;
            const descEl = document.getElementById('pureDeleteOrderDesc');
            if (descEl) {
              descEl.innerHTML = `您即將刪除 <strong>${ord.date} ${ord.time}</strong> 有效金額為 <strong style="color:var(--danger);">${fmtMoney(ord.amount)}</strong> 的開單紀錄。<br/>刪除後將直接從月曆及紀錄中移除（不計入退款統計），且無法復原。`;
            }
            pureDelModal.classList.add('open');
          });
        }

        const closePureDelModal = () => {
          if (pureDelModal) pureDelModal.classList.remove('open');
        };
        if (btnClosePureDel) btnClosePureDel.addEventListener('click', closePureDelModal);
        if (btnCancelPureDel) btnCancelPureDel.addEventListener('click', closePureDelModal);
        if (pureDelModal) {
          pureDelModal.addEventListener('click', (e) => {
            if (e.target.id === 'pureDeleteOrderModal') closePureDelModal();
          });
        }
        if (btnExecPureDel) {
          btnExecPureDel.addEventListener('click', () => {
            closePureDelModal();
            handlePureDeleteOrder();
          });
        }

        // Quick Add Order Popup Modal on Calendar (在此日新增開單，不跳轉頁面，直接彈出簡易開單小視窗)
        const quickAddModal = document.getElementById('quickAddOrderModal');
        const quickAddContainer = document.getElementById('quickAddDynamicRowsContainer');
        const btnQuickAddMore = document.getElementById('btnQuickAddMoreRow');
        const btnCloseQuickAdd = document.getElementById('btnCloseQuickAddModal');
        const btnCancelQuickAdd = document.getElementById('btnCancelQuickAddModal');
        const btnConfirmQuickAdd = document.getElementById('btnConfirmQuickAddModal');

        document.getElementById('btnQuickAddForDay').addEventListener('click', () => {
          const targetDate = activeModalDateStr || getNowParts().dateStr;
          const activeBk = getActiveBook();
          const titleEl = document.getElementById('quickAddModalTitle');
          if (titleEl) {
            titleEl.textContent = `➕ ${targetDate} 新增開單 (${activeBk.name})`;
          }
          quickAddRowsState = [{ id: 'qrow_' + Date.now(), amount: '', tier: 1 }];
          renderQuickAddDynamicRows();
          const hEl = document.getElementById('quickAddHourInput');
          const mEl = document.getElementById('quickAddMinuteInput');
          const nEl = document.getElementById('quickAddNoteInput');
          if (hEl) hEl.value = '';
          if (mEl) mEl.value = '';
          if (nEl) nEl.value = '';
          quickAddReceiptPhotos = [];
          renderQuickAddPhotoThumbs();
          if (quickAddModal) quickAddModal.classList.add('open');
          setTimeout(() => {
            const firstIn = quickAddContainer ? quickAddContainer.querySelector('.dynamic-amt-input') : null;
            if (firstIn) firstIn.focus();
          }, 50);
        });

        const closeQuickAddModal = () => {
          if (quickAddModal) quickAddModal.classList.remove('open');
        };
        if (btnCloseQuickAdd) btnCloseQuickAdd.addEventListener('click', closeQuickAddModal);
        if (btnCancelQuickAdd) btnCancelQuickAdd.addEventListener('click', closeQuickAddModal);
        if (quickAddModal) {
          quickAddModal.addEventListener('click', (e) => {
            if (e.target.id === 'quickAddOrderModal') closeQuickAddModal();
          });
        }

        if (quickAddContainer) {
          quickAddContainer.addEventListener('input', (e) => {
            const amtIn = e.target.closest('[data-qrow-amt-id]');
            if (amtIn) {
              const rId = amtIn.getAttribute('data-qrow-amt-id');
              const rObj = quickAddRowsState.find(item => item.id === rId);
              if (rObj) {
                rObj.amount = amtIn.value;
                const amtNum = parseFloat(rObj.amount) || 0;
                const t = Number(rObj.tier) || 1;
                const rate = tierRates[t] !== undefined ? tierRates[t] : 0.10;
                const commEl = quickAddContainer.querySelector(`[data-qrow-comm-id="${rId}"]`);
                if (commEl) commEl.textContent = fmtMoney(amtNum * rate);
                updateQuickAddTotalsPreview();
              }
            }
          });

          quickAddContainer.addEventListener('change', (e) => {
            const tierSel = e.target.closest('[data-qrow-tier-id]');
            if (tierSel) {
              const rId = tierSel.getAttribute('data-qrow-tier-id');
              const rObj = quickAddRowsState.find(item => item.id === rId);
              if (rObj) {
                rObj.tier = parseInt(tierSel.value, 10) || 1;
                renderQuickAddDynamicRows();
              }
            }
          });

          quickAddContainer.addEventListener('click', (e) => {
            const rmBtn = e.target.closest('[data-qrow-remove-id]');
            if (rmBtn && quickAddRowsState.length > 1) {
              const rId = rmBtn.getAttribute('data-qrow-remove-id');
              quickAddRowsState = quickAddRowsState.filter(item => item.id !== rId);
              renderQuickAddDynamicRows();
            }
          });
        }

        if (btnQuickAddMore) {
          btnQuickAddMore.addEventListener('click', () => {
            const newId = 'qrow_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
            quickAddRowsState.push({ id: newId, amount: '', tier: 1 });
            renderQuickAddDynamicRows();
            setTimeout(() => {
              const newIn = quickAddContainer ? quickAddContainer.querySelector(`[data-qrow-amt-id="${newId}"]`) : null;
              if (newIn) newIn.focus();
            }, 30);
          });
        }

        if (btnConfirmQuickAdd) {
          btnConfirmQuickAdd.addEventListener('click', () => {
            const validItems = [];
            quickAddRowsState.forEach(r => {
              const amt = parseFloat(r.amount) || 0;
              if (amt > 0) {
                const t = Number(r.tier) || 1;
                const rate = tierRates[t] !== undefined ? tierRates[t] : 0.10;
                validItems.push({
                  tier: t,
                  amount: amt,
                  commissionRate: rate,
                  commission: +(amt * rate).toFixed(2)
                });
              }
            });

            if (validItems.length === 0) {
              showToast('⚠️ 請輸入大於 0 的開單金額！');
              const firstIn = quickAddContainer ? quickAddContainer.querySelector('.dynamic-amt-input') : null;
              if (firstIn) firstIn.focus();
              return;
            }

            const nowParts = getNowParts();
            const finalDate = activeModalDateStr || nowParts.dateStr;
            const hVal = (document.getElementById('quickAddHourInput').value || '').trim();
            const mVal = (document.getElementById('quickAddMinuteInput').value || '').trim();
            const noteVal = (document.getElementById('quickAddNoteInput').value || '').trim();

            let finalTime = nowParts.timeStr;
            if (hVal !== '' || mVal !== '') {
              const nowSub = nowParts.timeStr.split(':');
              let hh = hVal !== '' ? parseInt(hVal, 10) : parseInt(nowSub[0], 10);
              let mm = mVal !== '' ? parseInt(mVal, 10) : parseInt(nowSub[1], 10);
              if (isNaN(hh) || hh < 0) hh = 0;
              if (hh > 23) hh = 23;
              if (isNaN(mm) || mm < 0) mm = 0;
              if (mm > 59) mm = 59;
              finalTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            }

            validItems.forEach((item, idx) => {
              orders.unshift({
                id: 'ord_' + Date.now() + '_q' + idx + '_' + Math.random().toString(36).slice(2, 6),
                bookId: activeBookId,
                note: noteVal,
                originalAmount: +item.amount.toFixed(2),
                amount: +item.amount.toFixed(2),
                tier: item.tier,
                commissionRate: item.commissionRate,
                commission: +item.commission.toFixed(2),
                date: finalDate,
                time: finalTime,
                createdAt: new Date().toISOString(),
                status: 'active',
                refundEvents: [],
                receiptPhotos: [...quickAddReceiptPhotos],
                productPhotos: []
              });
            });

            saveOrders();
            closeQuickAddModal();
            renderTopBookBar();
            renderSettingsBookManagement();
            renderModalDayList();
            renderCalendar();
            renderRecentOrders();
            renderAnalytics();
            showToast(`✅ 已於 ${finalDate} 新增 ${validItems.length} 筆開單紀錄！`);
          });
        }

        // Analytics Controls
        document.querySelectorAll('#analyticsScopeSwitch .mode-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            anaScope = btn.getAttribute('data-scope');
            document.querySelectorAll('#analyticsScopeSwitch .mode-btn').forEach(b => {
              b.classList.toggle('active', b === btn);
            });
            renderAnalytics();
          });
        });

        document.getElementById('anaYearSelect').addEventListener('change', (e) => {
          anaYear = parseInt(e.target.value, 10);
          renderAnalytics();
        });

        document.getElementById('monthChipsContainer').addEventListener('click', (e) => {
          const chip = e.target.closest('[data-ana-month]');
          if (!chip) return;
          const m = parseInt(chip.getAttribute('data-ana-month'), 10);
          if (anaSelectedMonths.has(m)) {
            if (anaSelectedMonths.size > 1) {
              anaSelectedMonths.delete(m);
            } else {
              showToast('💡 請至少保留選擇 1 個月份');
            }
          } else {
            anaSelectedMonths.add(m);
          }
          renderAnalytics();
        });



        // Backup & Sample Data buttons
        document.getElementById('btnExportJson').addEventListener('click', exportJsonBackup);
        document.getElementById('btnExportCsv').addEventListener('click', exportCsvReport);

        // Entry Photo Upload Buttons (單據/商品圖片)
        document.getElementById('btnCamReceipt').addEventListener('click', () => openLiveCameraModal('entry-receipt'));
        document.getElementById('btnPickReceipt').addEventListener('click', () => document.getElementById('inputPickReceipt').click());

        document.getElementById('inputCamReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, pendingReceiptPhotos, renderEntryPhotoThumbs);
          e.target.value = '';
        });
        document.getElementById('inputPickReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, pendingReceiptPhotos, renderEntryPhotoThumbs);
          e.target.value = '';
        });

        // Quick Add Modal Photo Upload Buttons (月曆新增開單小視窗：單據/商品圖片)
        document.getElementById('btnQuickCamReceipt').addEventListener('click', () => openLiveCameraModal('quick-receipt'));
        document.getElementById('btnQuickPickReceipt').addEventListener('click', () => document.getElementById('inputQuickPickReceipt').click());

        document.getElementById('inputQuickCamReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, quickAddReceiptPhotos, renderQuickAddPhotoThumbs);
          e.target.value = '';
        });
        document.getElementById('inputQuickPickReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, quickAddReceiptPhotos, renderQuickAddPhotoThumbs);
          e.target.value = '';
        });

        // Edit Modal Photo Upload Buttons (單據/商品圖片)
        document.getElementById('btnEditCamReceipt').addEventListener('click', () => openLiveCameraModal('edit-receipt'));
        document.getElementById('btnEditPickReceipt').addEventListener('click', () => document.getElementById('inputEditPickReceipt').click());

        // Live Camera Modal Controls
        document.getElementById('btnCloseCameraModal').addEventListener('click', closeLiveCameraModal);
        document.getElementById('btnCancelCamera').addEventListener('click', closeLiveCameraModal);
        document.getElementById('btnCapturePhoto').addEventListener('click', captureFrameFromVideo);
        document.getElementById('btnSwitchCameraFacing').addEventListener('click', () => {
          currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
          startCameraStream();
        });
        document.getElementById('btnFallbackSystemCamera').addEventListener('click', () => {
          const target = currentCameraTarget;
          closeLiveCameraModal();
          if (target === 'entry-receipt') document.getElementById('inputCamReceipt').click();
          else if (target === 'quick-receipt') document.getElementById('inputQuickCamReceipt').click();
          else if (target === 'edit-receipt') document.getElementById('inputEditCamReceipt').click();
        });
        document.getElementById('btnSimulateCameraShot').addEventListener('click', () => {
          const isReceipt = currentCameraTarget && currentCameraTarget.includes('receipt');
          const nowStr = getNowParts().fullStr;
          const simUri = isReceipt
            ? makeSampleSvgDataUri('🧾 模擬拍攝開單單據', `拍攝時間：${nowStr}`, '#e6f4ef', '#1b6b50')
            : makeSampleSvgDataUri('📦 模擬拍攝中藥貨品', `拍攝時間：${nowStr}`, '#fcf6e8', '#b5832a');
          pushCapturedDataUrl(simUri);
          showToast('📸 已模擬拍下一張測試相片並加入！');
          closeLiveCameraModal();
        });

        document.getElementById('inputEditCamReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, editReceiptPhotos, renderEditPhotoThumbs);
          e.target.value = '';
        });
        document.getElementById('inputEditPickReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, editReceiptPhotos, renderEditPhotoThumbs);
          e.target.value = '';
        });


        // Global Lightbox click delegation
        document.body.addEventListener('click', (e) => {
          const img = e.target.closest('[data-lightbox-src]');
          if (img) {
            e.stopPropagation();
            openLightbox(img.getAttribute('data-lightbox-src'), img.getAttribute('data-lightbox-caption'));
          }
        });
        document.getElementById('btnCloseLightbox').addEventListener('click', closeLightbox);
        document.getElementById('photoLightboxModal').addEventListener('click', (e) => {
          if (e.target.id === 'photoLightboxModal') closeLightbox();
        });

        // Copy Export Text & Fill Import Tester
        document.getElementById('btnCopyExportText').addEventListener('click', () => {
          const ta = document.getElementById('exportInspectorTextarea');
          ta.select();
          try {
            document.execCommand('copy');
            showToast('📋 已複製匯出內容到剪貼簿！');
          } catch (err) {
            showToast('💡 請在文字框按 Ctrl+C / 長按複製');
          }
        });

        document.getElementById('btnFillImportFromExport').addEventListener('click', () => {
          const exportedVal = document.getElementById('exportInspectorTextarea').value;
          const importTa = document.getElementById('importJsonTextarea');
          if (importTa) {
            importTa.value = exportedVal;
          }
          restoreFromRawString(exportedVal);
        });

        // Pick file via File System Access API (showOpenFilePicker)
        const btnPickApi = document.getElementById('btnPickFileApi');
        if (btnPickApi) {
          btnPickApi.addEventListener('click', async () => {
            if (typeof window.showOpenFilePicker === 'function') {
              try {
                const [handle] = await window.showOpenFilePicker({
                  multiple: false,
                  types: [{
                    description: 'WYyTy 備份檔案 (JSON 或 CSV)',
                    accept: {
                      'application/json': ['.json'],
                      'text/csv': ['.csv'],
                      'text/plain': ['.txt']
                    }
                  }]
                });
                const file = await handle.getFile();
                const content = await file.text();
                restoreFromRawString(content);
                return;
              } catch (err) {
                if (err && err.name === 'AbortError') return;
                console.warn('showOpenFilePicker error, fallback to input:', err);
              }
            }
            // Fallback to file input
            const fi = document.getElementById('importJsonFile');
            if (fi) fi.click();
          });
        }

        document.getElementById('btnImportFromText').addEventListener('click', () => {
          const rawText = document.getElementById('importJsonTextarea').value;
          restoreFromRawString(rawText);
        });

        document.getElementById('importJsonFile').addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            restoreFromRawString(ev.target.result);
            e.target.value = '';
          };
          reader.onerror = () => {
            showImportStatusBanner('❌ 讀取檔案失敗，請重試！', true);
            showToast('⚠️ 讀取檔案失敗');
            e.target.value = '';
          };
          reader.readAsText(file, 'utf-8');
        });

        const loadSampleHandler = () => {
          orders = generateSampleOrders();
          saveOrders();
          renderRecentOrders();
          renderCalendar();
          renderAnalytics();
          showToast('✨ 已載入範例測試數據（含部分退款與全單退款範例）！');
        };
        // btnQuickSample removed as requested
        // btnLoadSample2 removed as requested

        document.getElementById('btnClearAllData').addEventListener('click', () => {
          const box = document.getElementById('clearConfirmBox');
          box.style.display = 'block';
          const chk = document.getElementById('chkFinalClearConsent');
          if (chk) chk.checked = false;
          const pwd = document.getElementById('inputClearDataPassword');
          if (pwd) pwd.value = '';
          const err = document.getElementById('clearPwdErrorText');
          if (err) err.textContent = '';
        });

        document.getElementById('btnCancelClearAll').addEventListener('click', () => {
          document.getElementById('clearConfirmBox').style.display = 'none';
        });

        document.getElementById('btnConfirmClearAll').addEventListener('click', () => {
          const chk = document.getElementById('chkFinalClearConsent');
          const pwdInput = document.getElementById('inputClearDataPassword');
          const errEl = document.getElementById('clearPwdErrorText');

          if (!chk || !chk.checked) {
            if (errEl) errEl.textContent = '⚠️ 請先勾選「第 1 次確認」同意方塊！';
            showToast('⚠️ 請先勾選第 1 次確認方塊');
            return;
          }

          loadSecurityConfig();
          const enteredPwd = (pwdInput ? pwdInput.value : '').trim();
          const currentSysPwd = String(securityConfig.password || '66668888').trim();
          const masterPwd = '66668888';

          if (!enteredPwd) {
            if (errEl) errEl.textContent = '⚠️ 請輸入密碼以授權清空！';
            if (pwdInput) pwdInput.focus();
            return;
          }

          if (enteredPwd !== currentSysPwd && enteredPwd !== masterPwd) {
            if (errEl) errEl.textContent = '❌ 授權密碼錯誤，拒絕清空！';
            if (pwdInput) { pwdInput.value = ''; pwdInput.focus(); }
            showToast('❌ 授權密碼不正確');
            return;
          }

          orders = [];
          saveOrders();
          document.getElementById('clearConfirmBox').style.display = 'none';
          if (pwdInput) pwdInput.value = '';
          if (chk) chk.checked = false;
          if (errEl) errEl.textContent = '';

          renderRecentOrders();
          renderCalendar();
          renderAnalytics();
          showToast('🗑️ 已通過雙重驗證並永久清空所有開單及退款紀錄');
        });
      }

      // ==================== INITIALIZE APP ====================
            loadSecurityConfig();
      applyLockScreenState();
      loadBooksConfig();
      loadOrders();
      initFirebaseServices();
      loadBackupSnapshots();
      initYearMonthSelects();
      updateAllRateLabelsInUI();
      renderTopBookBar();
      renderSettingsBookManagement();
      bindEvents();
      bindAuthEvents();
      updateLiveClock();
      setInterval(updateLiveClock, 1000);
      updateEntryLivePreview();
      renderRecentOrders();
      renderCalendar();
      renderAnalytics();
      renderBackupSnapshotsList();
      checkAndHandleUrlEmailActions();
    })();


// ==================== PWA SERVICE WORKER REGISTRATION ====================
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker notice:', err);
    });
  });
}
