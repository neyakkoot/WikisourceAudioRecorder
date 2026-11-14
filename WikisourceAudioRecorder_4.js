
/**
 * Tamil Wikisource - Page-wise Audio Recorder
 *
 * Features:
 * 1. Works only on ProofreadPage Page namespace.
 * 2. Records audio for the currently opened Page.
 * 3. Draggable recording window (Mouse + Touch).
 * 4. Audio preview before upload.
 * 5. Uploads audio to Wikimedia Commons.
 * 6. Adds audio file to the same Page page.
 *
 * Author: Neyakkoo
 * Version: 1.1
 */

(function () {
    'use strict';

    /* ================================================
       1. CONFIGURATION
    ================================================ */

    var CONFIG = {
        commonsApi: 'https://commons.wikimedia.org/w/api.php',

        license: 'CC-BY-SA-4.0',

        categories: [
            'Tamil Wikisource audio books',
            'Spoken Tamil'
        ],

        sectionHeading: 'ஒலிப்பதிவு',

        buttonText: 'ஒலிப்பதிவு செய்க',

        fallbackPageNamespace: 250
    };


    /* ================================================
       2. CHECK MEDIAWIKI ENVIRONMENT
    ================================================ */

    if (typeof mw === 'undefined') {
        return;
    }

    var pageNamespace = mw.config.get('wgNamespaceNumber');

    var pageTitle = mw.config.get('wgPageName');


    /* ================================================
       3. DETECT PAGE NAMESPACE
    ================================================ */

    function getPageNamespaceId() {

        var namespaceIds = mw.config.get('wgNamespaceIds') || {};

        var possibleNames = [
            'page',
            'பக்கம்'
        ];

        for (var i = 0; i < possibleNames.length; i++) {

            var key = possibleNames[i].toLowerCase();

            if (
                Object.prototype.hasOwnProperty.call(
                    namespaceIds,
                    key
                )
            ) {
                return namespaceIds[key];
            }
        }

        return CONFIG.fallbackPageNamespace;
    }

    var PAGE_NAMESPACE = getPageNamespaceId();


    /* ================================================
       4. RUN ONLY ON PAGE NAMESPACE
    ================================================ */

    if (pageNamespace !== PAGE_NAMESPACE) {
        return;
    }

    if (!pageTitle || pageTitle.indexOf('/') === -1) {
        return;
    }


    /* ================================================
       5. GLOBAL VARIABLES
    ================================================ */

    var mediaRecorder = null;

    var recordedChunks = [];

    var recordedBlob = null;

    var audioStream = null;

    var recordingTimer = null;

    var recordingSeconds = 0;

    var selectedMimeType = '';

    var modalElement = null;

    var audioPreview = null;

    var statusElement = null;

    var timerElement = null;

    var startButton = null;

    var stopButton = null;

    var uploadButton = null;


    /* ================================================
       6. UTILITY FUNCTIONS
    ================================================ */

    function escapeHtml(value) {

        return String(value).replace(/[&<>"']/g, function (char) {

            var entities = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };

            return entities[char];
        });
    }


    function formatTime(seconds) {

        var minutes = Math.floor(seconds / 60);

        var remainingSeconds = seconds % 60;

        return (
            String(minutes).padStart(2, '0') +
            ':' +
            String(remainingSeconds).padStart(2, '0')
        );
    }


    function setStatus(message, isError) {

        if (!statusElement) {
            return;
        }

        statusElement.textContent = message;

        statusElement.style.color = isError
            ? '#b32424'
            : '#14804a';
    }


    function getSafeFileName(value) {

        return value
            .replace(/[\/\\:*?"<>|#%{}\[\]]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
    }


    function getFileExtension(mimeType) {

        if (mimeType.indexOf('ogg') !== -1) {
            return 'ogg';
        }

        if (mimeType.indexOf('webm') !== -1) {
            return 'webm';
        }

        if (mimeType.indexOf('mp4') !== -1) {
            return 'm4a';
        }

        return 'webm';
    }


    /* ================================================
       7. CREATE RECORDER BUTTON
    ================================================ */

    function createRecorderButton() {

        if (document.getElementById('ws-audio-record-button')) {
            return;
        }

        var button = document.createElement('button');

        button.id = 'ws-audio-record-button';

        button.type = 'button';

        button.textContent = CONFIG.buttonText;

        button.style.cssText = [
            'background:#14804a',
            'color:white',
            'border:0',
            'padding:9px 16px',
            'border-radius:5px',
            'font-size:14px',
            'font-weight:bold',
            'cursor:pointer',
            'margin:8px 0',
            'display:inline-block'
        ].join(';');

        button.addEventListener('click', openRecorderModal);

        var heading = document.getElementById('firstHeading');

        if (heading) {

            heading.insertAdjacentElement('afterend', button);

        } else {

            var content = document.getElementById('mw-content-text');

            if (content) {
                content.insertAdjacentElement('afterbegin', button);
            }
        }
    }


    /* ================================================
       8. CREATE RECORDING MODAL
    ================================================ */

    function openRecorderModal() {

        if (modalElement) {
            modalElement.remove();
            modalElement = null;
        }

        var overlay = document.createElement('div');

        overlay.id = 'ws-audio-modal';

        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,0.65)',
            'z-index:99999',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:15px',
            'box-sizing:border-box'
        ].join(';');

        overlay.innerHTML = `
            <div id="ws-audio-dialog" style="
                background:white;
                width:100%;
                max-width:520px;
                max-height:90vh;
                overflow-y:auto;
                padding:24px;
                border-radius:10px;
                box-shadow:0 5px 25px rgba(0,0,0,0.3);
                color:#202122;
                box-sizing:border-box;
                position:absolute;
                left:50%;
                top:50%;
                transform:translate(-50%, -50%);
            ">

                <h2 id="ws-audio-drag-header" style="
                    margin-top:0;
                    cursor:move;
                    user-select:none;
                    touch-action:none;
                    padding:8px;
                    background:#f1f3f5;
                    border-radius:5px;
                ">
                    ☰ தமிழ் விக்கிமூலம் - ஒலிப்பதிவு
                    <div style="
                        font-size:12px;
                        font-weight:normal;
                        color:#72777d;
                        margin-top:5px;
                    ">
                        இந்தத் தலைப்பைப் பிடித்து பெட்டியை நகர்த்தலாம்
                    </div>
                </h2>

                <p>
                    <strong>பக்கத்தின் பெயர்:</strong>
                    ${escapeHtml(pageTitle)}
                </p>

                <p>
                    இந்தப் பக்கத்தில் உள்ள உரையை வாசித்து
                    ஒலிப்பதிவு செய்யவும்.
                </p>

                <div id="ws-audio-timer" style="
                    text-align:center;
                    font-size:30px;
                    font-weight:bold;
                    margin:20px;
                ">
                    00:00
                </div>

                <div style="
                    display:flex;
                    gap:10px;
                    justify-content:center;
                    flex-wrap:wrap;
                    margin-bottom:18px;
                ">

                    <button id="ws-audio-start" type="button"
                        style="
                            background:#14804a;
                            color:white;
                            border:0;
                            padding:10px 18px;
                            border-radius:5px;
                            cursor:pointer;
                        ">
                        ● பதிவு தொடங்கு
                    </button>

                    <button id="ws-audio-stop" type="button"
                        disabled
                        style="
                            background:#b32424;
                            color:white;
                            border:0;
                            padding:10px 18px;
                            border-radius:5px;
                            cursor:pointer;
                            opacity:0.5;
                        ">
                        ■ பதிவு நிறுத்து
                    </button>

                </div>

                <div id="ws-audio-status" style="
                    margin:12px 0;
                    min-height:24px;
                    font-weight:bold;
                ">
                    ஒலிப்பதிவு செய்யத் தயாராக உள்ளது.
                </div>

                <audio id="ws-audio-preview"
                    controls
                    style="width:100%;display:none;margin:15px 0;">
                </audio>

                <div style="margin:15px 0;">

                    <label style="display:block;margin-bottom:8px;">
                        <input type="checkbox"
                            id="ws-audio-license">

                        இந்த ஒலிப்பதிவை CC BY-SA 4.0 உரிமத்தின்
                        கீழ் வெளியிட எனக்கு உரிமை உள்ளது என்பதை உறுதிப்படுத்துகிறேன்.
                    </label>

                </div>

                <div style="
                    display:flex;
                    gap:10px;
                    flex-wrap:wrap;
                    justify-content:flex-end;
                ">

                    <button id="ws-audio-upload"
                        type="button"
                        disabled
                        style="
                            background:#36c;
                            color:white;
                            border:0;
                            padding:10px 16px;
                            border-radius:5px;
                            cursor:pointer;
                            opacity:0.5;
                        ">
                        காமன்சில் பதிவேற்றுக
                    </button>

                    <button id="ws-audio-close"
                        type="button"
                        style="
                            background:#72777d;
                            color:white;
                            border:0;
                            padding:10px 16px;
                            border-radius:5px;
                            cursor:pointer;
                        ">
                        மூடு
                    </button>

                </div>

            </div>
        `;

        document.body.appendChild(overlay);

        modalElement = overlay;

        audioPreview = document.getElementById('ws-audio-preview');

        statusElement = document.getElementById('ws-audio-status');

        timerElement = document.getElementById('ws-audio-timer');

        startButton = document.getElementById('ws-audio-start');

        stopButton = document.getElementById('ws-audio-stop');

        uploadButton = document.getElementById('ws-audio-upload');

        startButton.addEventListener('click', startRecording);

        stopButton.addEventListener('click', stopRecording);

        uploadButton.addEventListener('click', uploadAudioToCommons);

        document.getElementById('ws-audio-close')
            .addEventListener('click', closeRecorderModal);

        document.getElementById('ws-audio-license')
            .addEventListener('change', updateUploadButton);

        overlay.addEventListener('click', function (event) {

            if (event.target === overlay) {
                closeRecorderModal();
            }
        });

        // Enable dragging after creating the modal.
        makeDraggable(
            document.getElementById('ws-audio-dialog'),
            document.getElementById('ws-audio-drag-header')
        );
    }


    /* ================================================
       9. DRAGGABLE WINDOW - MOUSE + TOUCH
    ================================================ */

    function makeDraggable(dialog, header) {

        if (!dialog || !header) {
            return;
        }

        var isDragging = false;

        var offsetX = 0;

        var offsetY = 0;

        header.title = 'இந்தத் தலைப்பைப் பிடித்து பெட்டியை நகர்த்தவும்';

        header.addEventListener('pointerdown', function (event) {

            // Only respond to the primary mouse button.
            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }

            isDragging = true;

            var rect = dialog.getBoundingClientRect();

            // Convert the centered dialog into a movable dialog.
            dialog.style.transform = 'none';

            dialog.style.left = rect.left + 'px';

            dialog.style.top = rect.top + 'px';

            offsetX = event.clientX - rect.left;

            offsetY = event.clientY - rect.top;

            header.setPointerCapture(event.pointerId);

            event.preventDefault();
        });

        header.addEventListener('pointermove', function (event) {

            if (!isDragging) {
                return;
            }

            var left = event.clientX - offsetX;

            var top = event.clientY - offsetY;

            var maxLeft = window.innerWidth - dialog.offsetWidth;

            var maxTop = window.innerHeight - dialog.offsetHeight;

            // Keep the complete dialog inside the visible screen.
            left = Math.max(0, Math.min(left, maxLeft));

            top = Math.max(0, Math.min(top, maxTop));

            dialog.style.left = left + 'px';

            dialog.style.top = top + 'px';

        });

        function stopDragging() {
            isDragging = false;
        }

        header.addEventListener('pointerup', stopDragging);

        header.addEventListener('pointercancel', stopDragging);

        header.addEventListener('lostpointercapture', stopDragging);
    }


    /* ================================================
       10. UPDATE UPLOAD BUTTON
    ================================================ */

    function updateUploadButton() {

        var licenseChecked = document.getElementById(
            'ws-audio-license'
        ).checked;

        var enabled = Boolean(recordedBlob) && licenseChecked;

        uploadButton.disabled = !enabled;

        uploadButton.style.opacity = enabled ? '1' : '0.5';
    }


    /* ================================================
       11. SELECT SUPPORTED AUDIO FORMAT
    ================================================ */

    function getSupportedMimeType() {

        var types = [
            'audio/ogg;codecs=opus',
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4'
        ];

        for (var i = 0; i < types.length; i++) {

            if (MediaRecorder.isTypeSupported(types[i])) {
                return types[i];
            }
        }

        return '';
    }


    /* ================================================
       12. START RECORDING
    ================================================ */

    async function startRecording() {

        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {

            setStatus(
                'இந்த உலாவியில் ஒலிப்பதிவு வசதி இல்லை. HTTPS இணைப்பைப் பயன்படுத்தவும்.',
                true
            );

            return;
        }

        if (typeof MediaRecorder === 'undefined') {

            setStatus(
                'இந்த உலாவியில் MediaRecorder ஆதரவு இல்லை.',
                true
            );

            return;
        }

        try {

            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            recordedChunks = [];

            recordedBlob = null;

            selectedMimeType = getSupportedMimeType();

            var options = selectedMimeType
                ? { mimeType: selectedMimeType }
                : {};

            mediaRecorder = new MediaRecorder(
                audioStream,
                options
            );

            mediaRecorder.ondataavailable = function (event) {

                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = function () {

                var actualMimeType =
                    mediaRecorder.mimeType ||
                    selectedMimeType ||
                    'audio/webm';

                recordedBlob = new Blob(recordedChunks, {
                    type: actualMimeType
                });

                var audioUrl = URL.createObjectURL(recordedBlob);

                audioPreview.src = audioUrl;

                audioPreview.style.display = 'block';

                setStatus(
                    'ஒலிப்பதிவு முடிந்தது. பதிவேற்றுவதற்கு முன் கேட்டு சரிபார்க்கவும்.',
                    false
                );

                updateUploadButton();

                stopMediaStream();
            };

            mediaRecorder.start();

            recordingSeconds = 0;

            timerElement.textContent = '00:00';

            recordingTimer = setInterval(function () {

                recordingSeconds++;

                timerElement.textContent = formatTime(
                    recordingSeconds
                );

            }, 1000);

            startButton.disabled = true;

            startButton.style.opacity = '0.5';

            stopButton.disabled = false;

            stopButton.style.opacity = '1';

            uploadButton.disabled = true;

            setStatus('ஒலிப்பதிவு நடைபெறுகிறது...', false);

        } catch (error) {

            setStatus(
                'ஒலிப்பதிவு தொடங்க முடியவில்லை: ' + error.message,
                true
            );

            stopMediaStream();
        }
    }


    /* ================================================
       13. STOP RECORDING
    ================================================ */

    function stopRecording() {

        if (!mediaRecorder || mediaRecorder.state !== 'recording') {
            return;
        }

        mediaRecorder.stop();

        clearInterval(recordingTimer);

        startButton.disabled = false;

        startButton.style.opacity = '1';

        stopButton.disabled = true;

        stopButton.style.opacity = '0.5';
    }


    /* ================================================
       14. STOP MICROPHONE
    ================================================ */

    function stopMediaStream() {

        if (audioStream) {

            audioStream.getTracks().forEach(function (track) {
                track.stop();
            });

            audioStream = null;
        }
    }


    /* ================================================
       15. CLOSE MODAL
    ================================================ */

    function closeRecorderModal() {

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }

        clearInterval(recordingTimer);

        stopMediaStream();

        if (audioPreview && audioPreview.src) {
            URL.revokeObjectURL(audioPreview.src);
        }

        if (modalElement) {
            modalElement.remove();
            modalElement = null;
        }
    }


    /* ================================================
       16. CREATE COMMONS FILE NAME
    ================================================ */

    function createCommonsFileName(mimeType) {

        var safeTitle = getSafeFileName(pageTitle);

        var extension = getFileExtension(mimeType);

        return 'Tamil_Wikisource_' +
            safeTitle +
            '_Audio.' +
            extension;
    }


    /* ================================================
       17. CREATE COMMONS DESCRIPTION
    ================================================ */

    function createCommonsDescription(fileName) {

        var categories = CONFIG.categories.map(function (category) {

            return '[[Category:' + category + ']]';

        }).join('\n');

        return `
== {{int:filedesc}} ==

{{Information
|description={{ta|தமிழ் விக்கிமூலத்தில் உள்ள பக்கத்திற்கான ஒலிப்பதிவு.}}
|date=${new Date().toISOString().slice(0, 10)}
|source=Own work
|author=[[User:Neyakkoo|Neyakkoo]]
|permission=
|other versions=
}}

== {{int:license-header}} ==

{{CC-BY-SA-4.0}}

== {{int:other fields}} ==

* Tamil Wikisource page: [[wikisource:ta:${pageTitle.replace(/_/g, ' ')}]]
* Audio file: ${fileName}

${categories}
        `.trim();
    }


    /* ================================================
       18. UPLOAD AUDIO TO COMMONS
    ================================================ */

    async function uploadAudioToCommons() {

        if (!recordedBlob) {

            setStatus('முதலில் ஒலிப்பதிவு செய்யவும்.', true);

            return;
        }

        var licenseChecked = document.getElementById(
            'ws-audio-license'
        ).checked;

        if (!licenseChecked) {

            setStatus(
                'உரிமம் தொடர்பான உறுதிப்படுத்தலைத் தேர்வு செய்யவும்.',
                true
            );

            return;
        }

        uploadButton.disabled = true;

        uploadButton.textContent = 'பதிவேற்றப்படுகிறது...';

        setStatus('விக்கிமீடியா காமன்சில் பதிவேற்றப்படுகிறது...', false);

        try {

            var mimeType = recordedBlob.type || 'audio/webm';

            var fileName = createCommonsFileName(mimeType);

            var description = createCommonsDescription(fileName);

            var commonsApi = new mw.ForeignApi(CONFIG.commonsApi, {
                anonymous: false
            });

            var uploadResult = await commonsApi.postWithEditToken({

                action: 'upload',

                filename: fileName,

                file: new File(
                    [recordedBlob],
                    fileName,
                    { type: mimeType }
                ),

                comment: 'Tamil Wikisource page audio recording',

                text: description,

                format: 'json'

            });

            if (
                !uploadResult ||
                !uploadResult.upload ||
                uploadResult.upload.result !== 'Success'
            ) {

                throw new Error(
                    uploadResult &&
                    uploadResult.upload &&
                    uploadResult.upload.warnings
                        ? JSON.stringify(uploadResult.upload.warnings)
                        : 'கோப்பைப் பதிவேற்ற முடியவில்லை.'
                );
            }

            setStatus(
                'கோப்பு காமன்சில் பதிவேற்றப்பட்டது. இப்போது பக்கத்தில் இணைக்கப்படுகிறது...',
                false
            );

            await addAudioToCurrentPage(fileName);

            setStatus(
                'வெற்றி! ஒலிக்கோப்பு பதிவேற்றப்பட்டு இந்தப் பக்கத்தில் இணைக்கப்பட்டது.',
                false
            );

            uploadButton.textContent = 'பதிவேற்றம் முடிந்தது';

            setTimeout(function () {
                window.location.reload();
            }, 2500);

        } catch (error) {

            console.error('Wikisource Audio Upload Error:', error);

            setStatus(
                'பிழை: ' + error.message,
                true
            );

            uploadButton.disabled = false;

            uploadButton.textContent = 'மீண்டும் முயற்சிக்கவும்';
        }
    }


    /* ================================================
       19. ADD AUDIO TO CURRENT PAGE
    ================================================ */

    async function addAudioToCurrentPage(fileName) {

        var localApi = new mw.Api();

        var pageData = await localApi.get({

            action: 'query',

            prop: 'revisions',

            titles: pageTitle,

            rvprop: 'ids|timestamp|content',

            rvslots: 'main',

            formatversion: 2
        });

        var pages = pageData.query.pages;

        if (!pages || !pages.length || pages[0].missing) {
            throw new Error('தற்போதைய பக்கத்தைக் கண்டறிய முடியவில்லை.');
        }

        var page = pages[0];

        var revision = page.revisions && page.revisions[0];

        if (!revision || !revision.slots || !revision.slots.main) {
            throw new Error('பக்கத்தின் உரையைப் பெற முடியவில்லை.');
        }

        var oldContent = revision.slots.main.content;

        var audioLink = '[[File:' + fileName + '|ஒலிப்பதிவு]]';

        if (oldContent.indexOf(fileName) !== -1) {
            throw new Error('இந்த ஒலிக்கோப்பு ஏற்கனவே இந்தப் பக்கத்தில் இணைக்கப்பட்டுள்ளது.');
        }

        var newContent = oldContent.trimEnd() +
            '\n\n== ' + CONFIG.sectionHeading + ' ==\n' +
            audioLink +
            '\n';

        try {

            await localApi.postWithEditToken({

                action: 'edit',

                title: pageTitle,

                text: newContent,

                summary: 'இந்தப் பக்கத்திற்கான ஒலிப்பதிவு இணைக்கப்பட்டது',

                baserevid: revision.revid,

                format: 'json'
            });

        } catch (error) {

            // Retry once if the page changed during upload.

            var latestData = await localApi.get({

                action: 'query',

                prop: 'revisions',

                titles: pageTitle,

                rvprop: 'ids|content',

                rvslots: 'main',

                formatversion: 2
            });

            var latestPage = latestData.query.pages[0];

            var latestRevision =
                latestPage.revisions &&
                latestPage.revisions[0];

            if (
                !latestRevision ||
                !latestRevision.slots ||
                !latestRevision.slots.main
            ) {
                throw error;
            }

            var latestContent = latestRevision.slots.main.content;

            if (latestContent.indexOf(fileName) !== -1) {
                return;
            }

            var updatedContent = latestContent.trimEnd() +
                '\n\n== ' + CONFIG.sectionHeading + ' ==\n' +
                audioLink +
                '\n';

            await localApi.postWithEditToken({

                action: 'edit',

                title: pageTitle,

                text: updatedContent,

                summary: 'இந்தப் பக்கத்திற்கான ஒலிப்பதிவு இணைக்கப்பட்டது',

                baserevid: latestRevision.revid,

                format: 'json'
            });
        }
    }


    /* ================================================
       20. INITIALIZE SCRIPT
    ================================================ */

    function initializeAudioRecorder() {

        if (mw.config.get('wgNamespaceNumber') !== PAGE_NAMESPACE) {
            return;
        }

        createRecorderButton();
    }


    /* ================================================
       21. LOAD MEDIAWIKI MODULES
    ================================================ */

    mw.loader.using([
        'mediawiki.api',
        'mediawiki.ForeignApi',
        'mediawiki.util'
    ]).then(function () {

        initializeAudioRecorder();

        mw.hook('wikipage.content').add(function () {

            initializeAudioRecorder();

        });

    }).catch(function (error) {

        console.error(
            'Wikisource Audio Recorder initialization error:',
            error
        );

    });

})();
