import {css} from 'lit';

export const componentStyles = css`
  :host {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    max-width: 900px;
    margin: 2rem auto;
    padding: 1rem;
    color: #333;
  }
  .container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }
  h1 { color: #1a73e8; margin-bottom: 0; }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    padding: 1rem;
    background: #f1f3f4;
    border-radius: 8px;
    width: 100%;
    box-sizing: border-box;
    align-items: end;
    justify-content: center;
  }
  .control-group { display: flex; flex-direction: column; gap: 0.25rem; }
  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    background: #1a73e8;
    color: white;
    font-weight: 500;
  }
  button:disabled { background: #e0e0e0; cursor: not-allowed; }
  .image-pair { display: flex; gap: 1rem; width: 100%; }
  .image-slot { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
  .image-slot h3 { margin: 0; font-size: 0.9rem; color: #5f6368; text-align: center; }
  .drop-zone {
    width: 100%;
    min-height: 300px;
    border: 2px dashed #dadce0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s;
    overflow: hidden;
  }
  .drop-zone:hover { background-color: #f8f9fa; border-color: #1a73e8; }
  .drop-zone p { color: #5f6368; text-align: center; padding: 1rem; }
  .drop-zone img, .drop-zone canvas { max-width: 100%; max-height: 50vh; object-fit: contain; }
  .result-zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .result-zone h3 { margin: 0; font-size: 0.9rem; color: #5f6368; text-align: center; }
  .inference-time { font-weight: 400; color: #1a73e8; }
  .result-display {
    width: 100%;
    min-height: 300px;
    border: 2px solid #dadce0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .result-display canvas { max-width: 100%; max-height: 50vh; object-fit: contain; }
  .result-display p { color: #5f6368; text-align: center; }
  .footer { width: 100%; text-align: center; }
  .status { min-height: 1.2em; color: #5f6368; }
  progress { width: 100%; }
`;
