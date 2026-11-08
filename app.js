(function() {
      // ==================== CONSTANTS & STATE ====================
      const STORAGE_KEY = 'tcm_orders_records_v2';

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

      function unlockApp() {
        const pwdInput = document.getElementById('lockPasswordInput');
        const errEl = document.getElementById('lockErrorMsg');
        const val = (pwdInput ? pwdInput.value : '').trim();

        if (val === securityConfig.password) {
          isAppUnlocked = true;
          if (errEl) errEl.textContent = '';
          applyLockScreenState();
          showToast('🌿 歡迎使用 WYyTy！');
        } else {
          if (errEl) errEl.textContent = '❌ 密碼錯誤，請重新輸入！';
          if (pwdInput) {
            pwdInput.value = '';
            pwdInput.focus();
          }
        }
      }

      const RATES_STORAGE_KEY = 'tcm_custom_rates_v2';

      // Default editable commission rates (stored as decimal e.g. 0.20)
      let tierRates = {
        1: 0.20,
        2: 0.15,
        3: 0.07
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
        renderThumbnailsList('entryReceiptThumbs', pendingReceiptPhotos, '單據圖片', (idx) => {
          pendingReceiptPhotos.splice(idx, 1);
          renderEntryPhotoThumbs();
        });
        renderThumbnailsList('entryProductThumbs', pendingProductPhotos, '貨品圖片', (idx) => {
          pendingProductPhotos.splice(idx, 1);
          renderEntryPhotoThumbs();
        });
      }

      function renderEditPhotoThumbs() {
        renderThumbnailsList('editReceiptThumbs', editReceiptPhotos, '單據圖片', (idx) => {
          editReceiptPhotos.splice(idx, 1);
          renderEditPhotoThumbs();
        });
        renderThumbnailsList('editProductThumbs', editProductPhotos, '貨品圖片', (idx) => {
          editProductPhotos.splice(idx, 1);
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
          'entry-receipt': '📷 拍攝開單單據圖片',
          'entry-product': '📷 拍攝貨品 / 中藥圖片',
          'edit-receipt': '📷 補拍開單單據圖片',
          'edit-product': '📷 補拍貨品 / 中藥圖片'
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
          const rateVal = customRate !== undefined ? customRate : 0.10;
          return `其他 (${fmtPct(rateVal)}佣)`;
        }
        return `${tier}仔 (${fmtPct(tierRates[tier] || 0)}佣)`;
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
                3: parsed[3]
              };
            }
          }
        } catch (e) {
          console.warn('Rates read fallback:', e);
        }
      }

      function saveCustomRates() {
        try {
          localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(tierRates));
        } catch (e) {
          console.warn('Rates save fallback:', e);
        }
      }

      function updateAllRateLabelsInUI() {
        const p1 = +(tierRates[1] * 100).toFixed(2);
        const p2 = +(tierRates[2] * 100).toFixed(2);
        const p3 = +(tierRates[3] * 100).toFixed(2);

        document.getElementById('headerRateSummary').textContent = `${p1}% / ${p2}% / ${p3}%`;

        // Inputs in Entry & Settings
        document.getElementById('rateInput1').value = p1;
        document.getElementById('rateInput2').value = p2;
        document.getElementById('rateInput3').value = p3;
        document.getElementById('settingsRate1').value = p1;
        document.getElementById('settingsRate2').value = p2;
        document.getElementById('settingsRate3').value = p3;

        // Single mode buttons
        document.getElementById('singleBtnRate1').textContent = `${p1}% 佣`;
        document.getElementById('singleBtnRate2').textContent = `${p2}% 佣`;
        document.getElementById('singleBtnRate3').textContent = `${p3}% 佣`;

        // Multi mode badges
        document.getElementById('multiBadgeRate1').textContent = `${p1}% 佣金`;
        document.getElementById('multiBadgeRate2').textContent = `${p2}% 佣金`;
        document.getElementById('multiBadgeRate3').textContent = `${p3}% 佣金`;

        // Direct boxes
        document.getElementById('directBoxesHeaderTitle').textContent =
          `1仔(${p1}%佣) / 2仔(${p2}%佣) / 3仔(${p3}%佣) 專屬輸入欄（可直接於下方任一欄輸入或與上方連動）`;
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
        }
      }

      function applyNewRates(r1Pct, r2Pct, r3Pct, recalcExisting) {
        const n1 = Math.max(0, Math.min(100, parseFloat(r1Pct) || 0)) / 100;
        const n2 = Math.max(0, Math.min(100, parseFloat(r2Pct) || 0)) / 100;
        const n3 = Math.max(0, Math.min(100, parseFloat(r3Pct) || 0)) / 100;

        tierRates = { 1: n1, 2: n2, 3: n3 };
        saveCustomRates();

        if (recalcExisting) {
          orders.forEach(o => {
            const newRate = tierRates[o.tier] !== undefined ? tierRates[o.tier] : o.commissionRate;
            o.commissionRate = newRate;
            o.commission = +(o.amount * newRate).toFixed(2);
          });
          saveOrders();
        }

        updateAllRateLabelsInUI();
        updateEntryLivePreview();
        renderRecentOrders();
        renderCalendar();
        renderAnalytics();
        showToast(`✅ 已更新默認佣金率為：1仔 ${fmtPct(n1)} / 2仔 ${fmtPct(n2)} / 3仔 ${fmtPct(n3)}${recalcExisting ? '（已同步重算現有紀錄）' : ''}`);
      }

      // ==================== STORAGE & DATA MODEL HELPERS ====================
      function normalizeOrderRecord(o) {
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
              reason: o.refundReason || '客人親身退款',
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
        try {
          const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tcm_orders_records_v1');
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
        saveOrders();
      }

      function saveOrders() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
        } catch (e) {
          console.warn('LocalStorage write fallback:', e);
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
                reason: '客人聯絡客服退款',
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
                reason: '客人親身退款',
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
                reason: '客人聯絡客服退款',
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
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => {
          el.remove();
        }, 3200);
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

      // ==================== NAVIGATION ====================
      function switchView(viewName) {
        
        // Lock screen events
        const lockForm = document.getElementById('lockScreenForm');
        if (lockForm) lockForm.addEventListener('submit', unlockApp);
        const unlockBtn = document.getElementById('btnUnlockApp');
        if (unlockBtn) unlockBtn.addEventListener('click', unlockApp);

        // Password settings toggle & save
        const chkPwd = document.getElementById('chkEnablePassword');
        if (chkPwd) {
          chkPwd.addEventListener('change', () => {
            securityConfig.enabled = chkPwd.checked;
            saveSecurityConfig();
            applyLockScreenState();
            showToast(securityConfig.enabled ? '🔒 已開啟密碼保護' : '🔓 已關閉密碼保護');
          });
        }

        const btnSavePwd = document.getElementById('btnSaveNewPassword');
        if (btnSavePwd) {
          btnSavePwd.addEventListener('click', () => {
            const cur = (document.getElementById('inputCurrentPassword').value || '').trim();
            const n1 = (document.getElementById('inputNewPassword').value || '').trim();
            const n2 = (document.getElementById('inputConfirmPassword').value || '').trim();

            if (cur !== securityConfig.password) {
              showToast('❌ 目前密碼輸入不正確！');
              return;
            }
            if (n1.length < 4) {
              showToast('⚠️ 新密碼至少需要 4 位字符！');
              return;
            }
            if (n1 !== n2) {
              showToast('⚠️ 兩次輸入的新密碼不一致！');
              return;
            }
            securityConfig.password = n1;
            saveSecurityConfig();
            document.getElementById('inputCurrentPassword').value = '';
            document.getElementById('inputNewPassword').value = '';
            document.getElementById('inputConfirmPassword').value = '';
            showToast('✅ 密碼修改成功！新密碼已即時生效');
          });
        }

        const btnLockNow = document.getElementById('btnLockAppNow');
        if (btnLockNow) {
          btnLockNow.addEventListener('click', () => {
            if (!securityConfig.enabled) {
              showToast('💡 密碼保護目前已關閉，請先勾選上方「開啟密碼保護」');
              return;
            }
            isAppUnlocked = false;
            applyLockScreenState();
            showToast('🔒 應用已鎖定');
          });
        }

        // Custom Tier 4 Rate input listeners
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
        if (entryMode === 'multi') {
          const m1 = parseFloat(document.getElementById('multiAmt1').value) || 0;
          const m2 = parseFloat(document.getElementById('multiAmt2').value) || 0;
          const m3 = parseFloat(document.getElementById('multiAmt3').value) || 0;
          const mOtherAmt = parseFloat(document.getElementById('multiAmtOther').value) || 0;
          const mOtherRatePct = parseFloat(document.getElementById('multiOtherRate').value) || 10;
          const mOtherRate = Math.max(0, mOtherRatePct) / 100;
          if (m1 > 0) pending.push({ tier: 1, amount: m1, commissionRate: tierRates[1], commission: +(m1 * tierRates[1]).toFixed(2) });
          if (m2 > 0) pending.push({ tier: 2, amount: m2, commissionRate: tierRates[2], commission: +(m2 * tierRates[2]).toFixed(2) });
          if (m3 > 0) pending.push({ tier: 3, amount: m3, commissionRate: tierRates[3], commission: +(m3 * tierRates[3]).toFixed(2) });
          if (mOtherAmt > 0) pending.push({ tier: 4, amount: mOtherAmt, commissionRate: mOtherRate, commission: +(mOtherAmt * mOtherRate).toFixed(2) });
        } else {
          const d1 = parseFloat(document.getElementById('directTier1Input').value) || 0;
          const d2 = parseFloat(document.getElementById('directTier2Input').value) || 0;
          const d3 = parseFloat(document.getElementById('directTier3Input').value) || 0;
          const dOther = parseFloat(document.getElementById('directTierOtherInput').value) || 0;
          const dOtherRatePct = parseFloat(document.getElementById('directTierOtherRate').value) || 10;
          const dOtherRate = Math.max(0, dOtherRatePct) / 100;
          const directSum = d1 + d2 + d3 + dOther;

          if (directSum > 0) {
            if (d1 > 0) pending.push({ tier: 1, amount: d1, commissionRate: tierRates[1], commission: +(d1 * tierRates[1]).toFixed(2) });
            if (d2 > 0) pending.push({ tier: 2, amount: d2, commissionRate: tierRates[2], commission: +(d2 * tierRates[2]).toFixed(2) });
            if (d3 > 0) pending.push({ tier: 3, amount: d3, commissionRate: tierRates[3], commission: +(d3 * tierRates[3]).toFixed(2) });
            if (dOther > 0) pending.push({ tier: 4, amount: dOther, commissionRate: dOtherRate, commission: +(dOther * dOtherRate).toFixed(2) });
          } else {
            const sAmt = parseFloat(document.getElementById('singleAmountInput').value) || 0;
            if (sAmt > 0) {
              let rate = tierRates[selectedSingleTier] || 0.20;
              if (selectedSingleTier === 4) {
                const customPct = parseFloat(document.getElementById('customTierRateInput').value) || 10;
                rate = Math.max(0, customPct) / 100;
              }
              pending.push({
                tier: selectedSingleTier,
                amount: sAmt,
                commissionRate: rate,
                commission: +(sAmt * rate).toFixed(2)
              });
            }
          }
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
          document.getElementById('singleAmountInput').focus();
          return;
        }

        const nowParts = getNowParts();
        const dateInputVal = document.getElementById('entryDateInput').value.trim();
        const hourInputVal = document.getElementById('entryHourInput').value.trim();
        const minInputVal = document.getElementById('entryMinuteInput').value.trim();

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

        document.getElementById('singleAmountInput').value = '';
        document.getElementById('directTier1Input').value = '';
        document.getElementById('directTier2Input').value = '';
        document.getElementById('directTier3Input').value = '';
        document.getElementById('multiAmt1').value = '';
        document.getElementById('multiAmt2').value = '';
        document.getElementById('multiAmt3').value = '';
        pendingReceiptPhotos = [];
        pendingProductPhotos = [];
        renderEntryPhotoThumbs();
        updateEntryLivePreview();
        renderRecentOrders();

        showToast(`✅ 已成功記錄 ${pending.length} 筆開單（${finalDate} ${finalTime}）！`);
      }

      function renderRecentOrders() {
        const container = document.getElementById('recentOrdersContainer');
        const activeList = orders.filter(o => o.status === 'active' && o.amount > 0);
        document.getElementById('recentCountLabel').textContent = `共 ${activeList.length} 筆有效紀錄`;

        const sorted = [...orders].sort((a, b) => {
          const dtA = `${a.date} ${a.time}`;
          const dtB = `${b.date} ${b.time}`;
          return dtB.localeCompare(dtA);
        }).slice(0, 12);

        if (sorted.length === 0) {
          container.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);">暫無開單紀錄，請在上方輸入開單金額並按「確認輸入」。</div>`;
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
              <div class="order-item-left">
                <span class="order-time-badge">${o.date} ${o.time}</span>
                <span class="tier-badge ${badgeClass}">${getTierLabel(o.tier, o.commissionRate)}</span>
                ${((o.receiptPhotos && o.receiptPhotos.length > 0) || (o.productPhotos && o.productPhotos.length > 0)) ? `<span class="cal-photo-tag">📷 單據${(o.receiptPhotos || []).length}/貨品${(o.productPhotos || []).length}</span>` : ''}
                ${hasPartial ? `<span class="cal-partial-tag">已部分退款 ${fmtMoneyShort(refundedSum)} (${lastRef ? lastRef.reason : ''})</span>` : ''}
                ${isFullRefunded ? `<span class="cal-refund-tag">已全單退款 ${fmtMoneyShort(refundedSum)}：${lastRef ? lastRef.reason : ''}</span>` : ''}
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

        let yearOptionsHtml = '';
        for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
          yearOptionsHtml += `<option value="${y}">${y}年</option>`;
        }
        calYSelect.innerHTML = yearOptionsHtml;
        anaYSelect.innerHTML = yearOptionsHtml;

        let monthOptionsHtml = '';
        for (let m = 1; m <= 12; m++) {
          monthOptionsHtml += `<option value="${m}">${m}月</option>`;
        }
        calMSelect.innerHTML = monthOptionsHtml;

        calYSelect.value = String(calYear);
        calMSelect.value = String(calMonth);
        anaYSelect.value = String(anaYear);
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
        document.getElementById('calYearSelect').value = String(calYear);
        document.getElementById('calMonthSelect').value = String(calMonth);

        const ymPrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
        const monthOrders = orders.filter(o => o.date && o.date.startsWith(ymPrefix));
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

        const dayOrders = orders
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
                  ${(o.productPhotos && o.productPhotos.length > 0) ? `<span class="cal-photo-tag">📦 貨品圖×${o.productPhotos.length}</span>` : ''}
                  ${refundedSum > 0 ? `<span class="cal-partial-tag">已部分退 ${fmtMoneyShort(refundedSum)} (原 ${fmtMoneyShort(o.originalAmount)})</span>` : ''}
                </div>
                <div class="order-item-right">
                  <div class="order-item-amt">${fmtMoney(o.amount)}</div>
                  <div class="order-item-comm">佣金 ${fmtMoney(o.commission)} · 點擊修改/刪除/退款 ❯</div>
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
          <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">已選取開單紀錄（可選擇返回、修改開單、單純刪除或辦理全單/部分退款）</div>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-size:1.35rem; font-weight:800; color:var(--primary);">有效金額：${fmtMoney(ord.amount)}</div>
              <div style="font-size:0.85rem; color:var(--accent-gold); font-weight:700;">應得佣金：${fmtMoney(ord.commission)} (${fmtPct(ord.commissionRate)})</div>
              ${refundedSum > 0 ? `<div style="font-size:0.78rem; color:var(--danger); margin-top:2px;">原始開單：${fmtMoney(ord.originalAmount)} ｜ 累計已退款：${fmtMoney(refundedSum)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <span class="tier-badge t${ord.tier}" style="font-size:0.85rem;">${ord.tier}仔 (${fmtPct(ord.commissionRate)}佣)</span>
              <div style="font-size:0.84rem; margin-top:4px; font-weight:600;">📅 ${ord.date} 🕒 ${ord.time}</div>
            </div>
          </div>
          ${((ord.receiptPhotos && ord.receiptPhotos.length > 0) || (ord.productPhotos && ord.productPhotos.length > 0)) ? `
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #b5cfc4;">
              <div style="font-size:0.78rem; font-weight:700; color:var(--primary); margin-bottom:6px;">📷 已附開單單據及貨品圖片（點擊圖片可放大檢視，點「修改開單」可增刪圖片）：</div>
              <div class="thumb-list">
                ${(ord.receiptPhotos || []).map((src, i) => `
                  <div class="thumb-item">
                    <img src="${src}" alt="單據圖" data-lightbox-src="${src}" data-lightbox-caption="🧾 開單單據圖片 (#${i + 1}) - ${ord.date} ${ord.time}" />
                    <span class="thumb-tag">🧾 單據#${i + 1}</span>
                  </div>
                `).join('')}
                ${(ord.productPhotos || []).map((src, i) => `
                  <div class="thumb-item">
                    <img src="${src}" alt="貨品圖" data-lightbox-src="${src}" data-lightbox-caption="📦 貨品圖片 (#${i + 1}) - ${ord.date} ${ord.time}" />
                    <span class="thumb-tag">📦 貨品#${i + 1}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : `<div style="margin-top:8px; font-size:0.76rem; color:var(--text-muted);">📷 此單暫未附上單據或貨品圖片（可點擊下方「✏️ 修改開單」補拍或選取圖片上傳）</div>`}
        `;
      }

      function openEditOrderPanel() {
        const ord = orders.find(o => o.id === activeModalOrderId);
        if (!ord) return;

        document.getElementById('editOrderPanel').style.display = 'block';
        document.getElementById('deleteReasonPanel').style.display = 'none';

        document.getElementById('editOrderAmount').value = ord.amount;
        document.getElementById('editOrderTier').value = String(ord.tier);
        document.getElementById('editOrderRate').value = +(ord.commissionRate * 100).toFixed(2);
        document.getElementById('editOrderDate').value = ord.date;
        document.getElementById('editOrderTime').value = ord.time;
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
        const newRatePct = parseFloat(document.getElementById('editOrderRate').value);
        const newRate = !isNaN(newRatePct) && newRatePct >= 0 ? newRatePct / 100 : tierRates[newTier];
        const newDate = document.getElementById('editOrderDate').value || ord.date;
        const newTime = document.getElementById('editOrderTime').value || ord.time;

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
        const reasonVal = selectedRadio ? selectedRadio.value : '客人親身退款';
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
        const quickBtns = document.getElementById('monthQuickBtns');
        const yearSelectWrap = document.getElementById('anaYearSelect').parentElement;

        if (anaScope === 'all-time') {
          container.style.display = 'none';
          hintEl.style.display = 'none';
          quickBtns.style.display = 'none';
          yearSelectWrap.style.display = 'none';
          return;
        }

        yearSelectWrap.style.display = 'flex';

        if (anaScope === 'full-year') {
          container.style.display = 'none';
          hintEl.style.display = 'none';
          quickBtns.style.display = 'none';
          descEl.textContent = `（正檢視 ${anaYear} 年全年 1–12 月總分析）`;
          return;
        }

        container.style.display = 'flex';
        hintEl.style.display = 'block';
        quickBtns.style.display = 'flex';

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
        return orders.filter(o => {
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

        // 1. Tier Breakdown
        const tierStats = [1, 2, 3, 4].map(t => {
          const list = activeOrders.filter(o => o.tier === t);
          const amt = list.reduce((s, o) => s + o.amount, 0);
          const comm = list.reduce((s, o) => s + o.commission, 0);
          const pct = totalSales > 0 ? (amt / totalSales) * 100 : 0;
          return { tier: t, count: list.length, amt, comm, pct };
        });

        const tierColors = { 1: 'var(--tier1)', 2: 'var(--tier2)', 3: 'var(--tier3)', 4: '#ea580c' };
        document.getElementById('tierBreakdownVisual').innerHTML = tierStats.map(st => `
          <div class="bar-row">
            <div class="bar-label-line">
              <span>${ getTierLabel(st.tier) } · ${st.count} 單</span>
              <span>開單 ${fmtMoney(st.amt)} (${st.pct.toFixed(1)}%) ｜ <strong>佣金 ${fmtMoney(st.comm)}</strong></span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${Math.max(st.pct, st.amt > 0 ? 3 : 0)}%; background:${tierColors[st.tier]};"></div>
            </div>
          </div>
        `).join('');

        document.getElementById('tierBreakdownTableBody').innerHTML = `
          ${tierStats.map(st => `
            <tr>
              <td><span class="tier-badge t${st.tier}">${getTierLabel(st.tier)}</span></td>
              <td class="num-col">${st.count} 單</td>
              <td class="num-col">${fmtMoney(st.amt)}</td>
              <td class="num-col">${st.pct.toFixed(1)}%</td>
              <td class="num-col" style="font-weight:700; color:var(--primary);">${fmtMoney(st.comm)}</td>
            </tr>
          `).join('')}
          <tr style="background:var(--bg-subtle); font-weight:800;">
            <td>總計</td>
            <td class="num-col">${activeOrders.length} 單</td>
            <td class="num-col">${fmtMoney(totalSales)}</td>
            <td class="num-col">${totalSales > 0 ? '100.0%' : '0.0%'}</td>
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

        // 6. Annual Summary Table
        renderYearlySummaryTable();
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
        const periods = [
          { key: 'morning', label: '上午 (06:00–11:59)', count: 0, amt: 0 },
          { key: 'afternoon', label: '下午 (12:00–17:59)', count: 0, amt: 0 },
          { key: 'evening', label: '晚上 (18:00–23:59)', count: 0, amt: 0 },
          { key: 'night', label: '凌晨 (00:00–05:59)', count: 0, amt: 0 }
        ];

        const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, amt: 0 }));

        activeOrders.forEach(o => {
          const hh = parseInt((o.time || '12:00').split(':')[0], 10);
          const safeH = isNaN(hh) ? 12 : Math.min(23, Math.max(0, hh));
          hourBuckets[safeH].count += 1;
          hourBuckets[safeH].amt += o.amount;

          if (safeH >= 6 && safeH <= 11) {
            periods[0].count += 1; periods[0].amt += o.amount;
          } else if (safeH >= 12 && safeH <= 17) {
            periods[1].count += 1; periods[1].amt += o.amount;
          } else if (safeH >= 18 && safeH <= 23) {
            periods[2].count += 1; periods[2].amt += o.amount;
          } else {
            periods[3].count += 1; periods[3].amt += o.amount;
          }
        });

        document.getElementById('timePeriodSummary').innerHTML = `
          <div class="grid-2" style="gap:8px;">
            ${periods.map(p => `
              <div style="background:var(--bg-subtle); padding:8px 12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                <span><strong>${p.label}</strong></span>
                <span>${p.count} 單 · <strong style="color:var(--primary);">${fmtMoneyShort(p.amt)}</strong></span>
              </div>
            `).join('')}
          </div>
        `;

        const maxHourCount = Math.max(1, ...hourBuckets.map(b => b.count));
        const activeHours = hourBuckets.filter(b => b.count > 0);
        const listToRender = activeHours.length > 0 ? activeHours : hourBuckets.slice(9, 21);

        document.getElementById('hourlyDistributionContainer').innerHTML = listToRender.map(b => {
          const hStr = `${String(b.hour).padStart(2, '0')}:00 – ${String(b.hour).padStart(2, '0')}:59`;
          const pct = (b.count / maxHourCount) * 100;
          return `
            <div class="bar-row">
              <div class="bar-label-line">
                <span>${hStr}</span>
                <span>${b.count} 單 ｜ ${fmtMoney(b.amt)}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${pct}%; background:var(--accent-gold);"></div>
              </div>
            </div>
          `;
        }).join('');
      }

      function renderRefundAnalysis(refundEvents, totalRefundAmt) {
        const standardReasons = [
          '客人親身退款',
          '客人聯絡客服退款',
          '消委會介入',
          '海關介入',
          '其他原因'
        ];

        const reasonStats = standardReasons.map(r => {
          const matched = refundEvents.filter(ev => (ev.reason || '其他原因') === r);
          const amt = matched.reduce((s, ev) => s + ev.amount, 0);
          const pct = totalRefundAmt > 0 ? (amt / totalRefundAmt) * 100 : 0;
          return { reason: r, count: matched.length, amt, pct };
        });

        document.getElementById('refundReasonChart').innerHTML = reasonStats.map(st => `
          <div class="bar-row">
            <div class="bar-label-line">
              <span>${st.reason} (${st.count} 筆)</span>
              <span style="color:var(--danger);">${fmtMoney(st.amt)} (${st.pct.toFixed(1)}%)</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${Math.max(st.pct, st.amt > 0 ? 3 : 0)}%; background:var(--danger);"></div>
            </div>
          </div>
        `).join('');

        document.getElementById('refundReasonTableBody').innerHTML = `
          ${reasonStats.map(st => `
            <tr>
              <td>${st.reason}</td>
              <td class="num-col">${st.count} 筆</td>
              <td class="num-col" style="color:var(--danger); font-weight:700;">${fmtMoney(st.amt)}</td>
              <td class="num-col">${st.pct.toFixed(1)}%</td>
            </tr>
          `).join('')}
          <tr style="background:var(--danger-bg); font-weight:800; color:var(--danger);">
            <td>總退款合計</td>
            <td class="num-col">${refundEvents.length} 筆</td>
            <td class="num-col">${fmtMoney(totalRefundAmt)}</td>
            <td class="num-col">${totalRefundAmt > 0 ? '100.0%' : '0.0%'}</td>
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
        const yearsSet = new Set([anaYear]);
        orders.forEach(o => {
          if (o.date) {
            const y = parseInt(o.date.slice(0, 4), 10);
            if (!isNaN(y)) yearsSet.add(y);
          }
        });

        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        tbody.innerHTML = sortedYears.map(y => {
          const yPrefix = `${y}-`;
          const yOrders = orders.filter(o => o.date && o.date.startsWith(yPrefix));
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
      function showExportInspector(title, contentStr, filename, mimeType, csvRowsForTable) {
        const panel = document.getElementById('exportInspectorPanel');
        const titleEl = document.getElementById('exportInspectorTitle');
        const textarea = document.getElementById('exportInspectorTextarea');
        const dlLink = document.getElementById('directDownloadLink');
        const csvTableWrap = document.getElementById('csvPreviewTableWrap');

        panel.style.display = 'block';
        titleEl.textContent = `${title}（檔名：${filename}，共 ${orders.length} 筆紀錄）`;
        textarea.value = contentStr;

        const dataUri = `data:${mimeType};charset=utf-8,` + encodeURIComponent(contentStr);
        dlLink.href = dataUri;
        dlLink.setAttribute('download', filename);

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

      function exportJsonBackup() {
        const backupPayload = {
          version: 2,
          exportedAt: getNowParts().fullStr,
          tierRates,
          orders
        };
        const dataStr = JSON.stringify(backupPayload, null, 2);
        const filename = `中藥開單紀錄備份_${getNowParts().dateStr}.json`;

        showExportInspector('📄 JSON 完整備份實質匯出內容', dataStr, filename, 'application/json', null);

        try {
          const blob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) {
          console.warn('Download fallback:', e);
        }
        showToast('💾 已生成 JSON 匯出內容（可於下方直接檢視、複製或另存）！');
      }

      function exportCsvReport() {
        const headers = ['開單編號', '開單日期', '開單時間', '級別', '佣金率', '原始開單金額', '當前有效金額', '有效佣金金額', '累計已退金額', '單據圖數', '貨品圖數', '狀態', '退款原因明細'];
        const rows = orders.map(o => {
          const refSum = getOrderTotalRefunded(o);
          const refSummary = (o.refundEvents || []).map(ev => `${ev.type === 'partial' ? '部分退' : '全退'}$${ev.amount}(${ev.reason}${ev.note ? ':' + ev.note : ''})`).join('; ');
          return [
            o.id,
            o.date,
            o.time,
            `${o.tier}仔`,
            `${+(o.commissionRate * 100).toFixed(2)}%`,
            o.originalAmount,
            o.amount,
            o.commission,
            refSum,
            (o.receiptPhotos || []).length,
            (o.productPhotos || []).length,
            o.status === 'active' && o.amount > 0 ? (refSum > 0 ? '有效(含部分退款)' : '有效') : '已全單退款',
            refSummary.replace(/,/g, '，') || '--'
          ];
        });
        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const filename = `中藥開單及佣金報表_${getNowParts().dateStr}.csv`;

        showExportInspector('📊 CSV 報表實質匯出內容（含下方表格預覽）', csvContent, filename, 'text/csv', [headers, ...rows]);

        try {
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) {
          console.warn('CSV download fallback:', e);
        }
        showToast('📊 已生成 CSV 報表內容（可於下方直接檢視表格及複製）！');
      }

      function restoreFromParsedJson(parsed) {
        if (Array.isArray(parsed)) {
          orders = parsed.map(normalizeOrderRecord);
          saveOrders();
        } else if (parsed && Array.isArray(parsed.orders)) {
          if (parsed.tierRates) {
            tierRates = parsed.tierRates;
            saveCustomRates();
            updateAllRateLabelsInUI();
          }
          orders = parsed.orders.map(normalizeOrderRecord);
          saveOrders();
        } else {
          showToast('⚠️ 備份格式不正確，請確認為本系統匯出的 JSON');
          return false;
        }
        renderRecentOrders();
        renderCalendar();
        renderAnalytics();
        showToast(`✅ 成功還原 ${orders.length} 筆開單紀錄！`);
        return true;
      }

      // ==================== EVENT LISTENERS INIT ====================
      function bindEvents() {
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

        // Settings tab Commission % Save & Reset
        document.getElementById('btnSettingsSaveRates').addEventListener('click', () => {
          const r1 = document.getElementById('settingsRate1').value;
          const r2 = document.getElementById('settingsRate2').value;
          const r3 = document.getElementById('settingsRate3').value;
          const recalc = document.getElementById('chkSettingsRecalcExisting').checked;
          applyNewRates(r1, r2, r3, recalc);
        });

        document.getElementById('btnSettingsResetRates').addEventListener('click', () => {
          const recalc = document.getElementById('chkSettingsRecalcExisting').checked;
          applyNewRates(20, 15, 7, recalc);
        });

        // Entry mode switch
        document.getElementById('modeBtnSingle').addEventListener('click', () => {
          entryMode = 'single';
          document.getElementById('modeBtnSingle').classList.add('active');
          document.getElementById('modeBtnMulti').classList.remove('active');
          document.getElementById('entryPanelSingle').style.display = 'block';
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

        // Clear Date/Time
        document.getElementById('btnClearDateTime').addEventListener('click', () => {
          document.getElementById('entryDateInput').value = '';
          document.getElementById('entryHourInput').value = '';
          document.getElementById('entryMinuteInput').value = '';
          showToast('🕒 已清空日期與時間，確認輸入時將自動採用當下時間');
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

        // Calendar controls
        document.getElementById('calYearSelect').addEventListener('change', (e) => {
          calYear = parseInt(e.target.value, 10);
          renderCalendar();
        });

        document.getElementById('calMonthSelect').addEventListener('change', (e) => {
          calMonth = parseInt(e.target.value, 10);
          renderCalendar();
        });

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
        document.getElementById('editOrderTier').addEventListener('change', (e) => {
          const t = parseInt(e.target.value, 10) || 1;
          document.getElementById('editOrderRate').value = +(tierRates[t] * 100).toFixed(2);
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

        document.getElementById('btnQuickAddForDay').addEventListener('click', () => {
          const targetDate = activeModalDateStr;
          closeDayModal();
          switchView('entry');
          if (targetDate) {
            document.getElementById('entryDateInput').value = targetDate;
          }
          document.getElementById('singleAmountInput').focus();
        });

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

        document.getElementById('btnSelectCurrentMonth').addEventListener('click', () => {
          anaSelectedMonths = new Set([calMonth]);
          renderAnalytics();
        });

        document.getElementById('btnSelectH1').addEventListener('click', () => {
          anaSelectedMonths = new Set([1, 2, 3, 4, 5, 6]);
          renderAnalytics();
        });

        document.getElementById('btnSelectH2').addEventListener('click', () => {
          anaSelectedMonths = new Set([7, 8, 9, 10, 11, 12]);
          renderAnalytics();
        });

        document.getElementById('btnSelectAllMonths').addEventListener('click', () => {
          anaSelectedMonths = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
          renderAnalytics();
        });

        // Backup & Sample Data buttons
        document.getElementById('btnExportJson').addEventListener('click', exportJsonBackup);
        document.getElementById('btnExportCsv').addEventListener('click', exportCsvReport);

        // Entry Photo Upload Buttons (Use Live WebRTC Camera for 拍照 buttons!)
        document.getElementById('btnCamReceipt').addEventListener('click', () => openLiveCameraModal('entry-receipt'));
        document.getElementById('btnPickReceipt').addEventListener('click', () => document.getElementById('inputPickReceipt').click());
        document.getElementById('btnCamProduct').addEventListener('click', () => openLiveCameraModal('entry-product'));
        document.getElementById('btnPickProduct').addEventListener('click', () => document.getElementById('inputPickProduct').click());

        document.getElementById('inputCamReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, pendingReceiptPhotos, renderEntryPhotoThumbs);
          e.target.value = '';
        });
        document.getElementById('inputPickReceipt').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, pendingReceiptPhotos, renderEntryPhotoThumbs);
          e.target.value = '';
        });
        document.getElementById('inputCamProduct').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, pendingProductPhotos, renderEntryPhotoThumbs);
          e.target.value = '';
        });
        document.getElementById('inputPickProduct').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, pendingProductPhotos, renderEntryPhotoThumbs);
          e.target.value = '';
        });

        // Edit Modal Photo Upload Buttons (Use Live WebRTC Camera for 拍照 buttons!)
        document.getElementById('btnEditCamReceipt').addEventListener('click', () => openLiveCameraModal('edit-receipt'));
        document.getElementById('btnEditPickReceipt').addEventListener('click', () => document.getElementById('inputEditPickReceipt').click());
        document.getElementById('btnEditCamProduct').addEventListener('click', () => openLiveCameraModal('edit-product'));
        document.getElementById('btnEditPickProduct').addEventListener('click', () => document.getElementById('inputEditPickProduct').click());

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
          else if (target === 'entry-product') document.getElementById('inputCamProduct').click();
          else if (target === 'edit-receipt') document.getElementById('inputEditCamReceipt').click();
          else if (target === 'edit-product') document.getElementById('inputEditCamProduct').click();
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
        document.getElementById('inputEditCamProduct').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, editProductPhotos, renderEditPhotoThumbs);
          e.target.value = '';
        });
        document.getElementById('inputEditPickProduct').addEventListener('change', (e) => {
          handleFilesSelected(e.target.files, editProductPhotos, renderEditPhotoThumbs);
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

        // Native Share for APK / Mobile browsers
        document.getElementById('btnNativeShareExport').addEventListener('click', async () => {
          const contentStr = document.getElementById('exportInspectorTextarea').value;
          const dlLink = document.getElementById('directDownloadLink');
          const fname = dlLink.getAttribute('download') || 'tcm_backup.json';
          const isCsv = fname.endsWith('.csv');
          const mime = isCsv ? 'text/csv' : 'application/json';

          if (navigator.share) {
            try {
              const fileObj = new File([contentStr], fname, { type: mime });
              if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                await navigator.share({
                  title: fname,
                  text: '中藥開單紀錄匯出備份檔案',
                  files: [fileObj]
                });
                showToast('✅ 已調用系統分享選單！');
                return;
              }
              await navigator.share({
                title: fname,
                text: contentStr
              });
              showToast('✅ 已調用系統分享選單！');
              return;
            } catch (err) {
              if (err && err.name === 'AbortError') return;
            }
          }
          const ta = document.getElementById('exportInspectorTextarea');
          ta.select();
          try { document.execCommand('copy'); } catch (e) {}
          showToast('📋 此環境不支援系統分享面板，已自動為你複製內容到剪貼簿！');
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
          importTa.value = exportedVal;
          importTa.focus();
          showToast('⤵️ 已將匯出內容填入下方還原測試區，你可修改內容後點擊「執行還原測試」');
        });

        document.getElementById('btnImportFromText').addEventListener('click', () => {
          const rawText = document.getElementById('importJsonTextarea').value.trim();
          if (!rawText) {
            showToast('⚠️ 請先在文字框貼上 JSON 備份內容');
            return;
          }
          try {
            const parsed = JSON.parse(rawText);
            restoreFromParsedJson(parsed);
          } catch (err) {
            showToast('⚠️ JSON 語法格式錯誤，請檢查貼上的內容');
          }
        });

        document.getElementById('importJsonFile').addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const parsed = JSON.parse(ev.target.result);
              restoreFromParsedJson(parsed);
            } catch (err) {
              showToast('⚠️ 讀取 JSON 檔案失敗');
            }
          };
          reader.readAsText(file);
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
          document.getElementById('clearConfirmBox').style.display = 'block';
        });
        document.getElementById('btnCancelClearAll').addEventListener('click', () => {
          document.getElementById('clearConfirmBox').style.display = 'none';
        });
        document.getElementById('btnConfirmClearAll').addEventListener('click', () => {
          orders = [];
          saveOrders();
          document.getElementById('clearConfirmBox').style.display = 'none';
          renderRecentOrders();
          renderCalendar();
          renderAnalytics();
          showToast('🗑️ 已清空所有開單及退款紀錄');
        });
      }

      // ==================== INITIALIZE APP ====================
            loadSecurityConfig();
      applyLockScreenState();
      loadCustomRates();
      loadOrders();
      initYearMonthSelects();
      updateAllRateLabelsInUI();
      bindEvents();
      updateLiveClock();
      setInterval(updateLiveClock, 1000);
      updateEntryLivePreview();
      renderRecentOrders();
      renderCalendar();
      renderAnalytics();
    })();


// ==================== PWA SERVICE WORKER & INSTALL PROMPT ====================
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => {
        const badge = document.querySelector('.offline-badge');
        if (badge) {
          badge.textContent = '● 離線安裝就緒 (PWA/APK)';
        }
      })
      .catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const installBtn = document.getElementById('btnPwaInstall');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('btnPwaInstall');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      deferredInstallPrompt = null;
    });
  }
});
