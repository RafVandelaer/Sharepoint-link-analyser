Fix needed in data-analyzer.js line ~291:

```javascript
showAnalysisView() {
    const uploadView = this.querySelector('#upload-view');
    const analysisView = this.querySelector('#analysis-view');
    
    this.currentView = 'analysis';  // ADD THIS LINE
    
    if (uploadView) uploadView.style.display = 'none';
```

This ensures currentView is set to 'analysis' so theme changes trigger chart re-rendering.
